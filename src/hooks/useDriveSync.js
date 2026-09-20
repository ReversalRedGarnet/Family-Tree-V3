import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, isConfigured } from '../utils/driveConfig';
import {
  GOOGLE_DRIVE_SCOPE,
  decideSyncAction,
  findAppDataFile,
  downloadAppDataFile,
  uploadAppDataFile,
} from '../utils/driveSync';

const FLAG_KEY = 'family-tree/drive-sync/v1';
export const PUSH_DEBOUNCE_MS = 2500;
const SCRIPT_WAIT_TIMEOUT_MS = 10000;

// Routine autosync retry: the original debounced push counts as attempt 1;
// up to this many MORE attempts follow a failure before giving up outright
// and surfacing a real error. Backoff doubles each time from a 5s base,
// capped at 80s, so a real outage still gets noticed within roughly two
// minutes rather than being retried forever or given up on after one blip.
// Exported so useDriveSync.test.js can drive fake timers off the real
// values instead of duplicating them as magic numbers that could drift.
export const PUSH_MAX_ATTEMPTS = 5;
export const PUSH_RETRY_BASE_MS = 5000;
export const PUSH_RETRY_MAX_MS = 80000;

// A little randomness on top of the exponential curve so several tabs (or
// several people in the same family, signed in at once) that all start
// failing at the same moment don't all retry in the same lockstep instant.
function pushRetryDelay(attempt) {
  const base = Math.min(PUSH_RETRY_BASE_MS * 2 ** (attempt - 1), PUSH_RETRY_MAX_MS);
  return base + Math.random() * 1000;
}

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

// What THIS device remembers about its own sync history — never the tree
// itself, just enough to answer decideSyncAction's questions next time:
// was sign-in ever completed here, what Drive file id did we find, and
// what was Drive's own savedAt the last time we successfully pushed or
// pulled.
function readFlags() {
  if (!hasStorage()) return { signedIn: false, fileId: null, lastSyncedAt: null };
  try {
    const raw = window.localStorage.getItem(FLAG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      signedIn: Boolean(parsed?.signedIn),
      fileId: parsed?.fileId || null,
      lastSyncedAt: parsed?.lastSyncedAt || null,
    };
  } catch {
    return { signedIn: false, fileId: null, lastSyncedAt: null };
  }
}

function writeFlags(flags) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(FLAG_KEY, JSON.stringify(flags));
  } catch {
    // Same rule as the tree's own autosave: a failed write here shouldn't
    // interrupt anything. Worst case, the next sign-in re-asks a question
    // (`ask` instead of a silent `upload`) that a successful write would
    // have skipped.
  }
}

// The GIS script tag in index.html loads asynchronously, so `window.google`
// may not exist yet the moment this hook mounts. Waited for here rather
// than assumed — an ad blocker or a firewalled network can keep it from
// ever arriving, and that's a real, not hypothetical, way for this feature
// to fail quietly if nothing checked.
function waitForGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(poll);
        resolve(window.google);
      } else if (Date.now() - start > SCRIPT_WAIT_TIMEOUT_MS) {
        clearInterval(poll);
        reject(new Error('Could not reach Google — check your connection or ad blocker.'));
      }
    }, 150);
  });
}

function requestToken(tokenClient, prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp?.error) reject(new Error(resp.error_description || resp.error));
      else resolve(resp.access_token);
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

function emptyGraph(people, relationships) {
  return Object.keys(people || {}).length === 0 && Object.keys(relationships || {}).length === 0;
}

// The single source of truth for whether Drive sync is even switched on:
// the config file still has its placeholder client ID. Everything else in
// this hook assumes `configured` has already been checked by the caller.
export const driveSyncConfigured = isConfigured();

export function useDriveSync({ people, relationships, replaceGraph, pushToast }) {
  const [status, setStatus] = useState('signed-out'); // signed-out | connecting | signed-in | syncing | conflict | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [conflict, setConflict] = useState(null); // { driveSavedAt, fileId } while a fresh choice is pending -- the confirm dialog (App.jsx) is showing exactly while this is set
  // Set only when carrying out an ALREADY-MADE conflict choice fails (the
  // network drops between the person answering and the request landing).
  // `conflict` itself is deliberately NOT reused for this: by the time this
  // is set, the dialog it drove has already closed, so a truthy `conflict`
  // would misreport "a decision is still pending" when what actually failed
  // was carrying out a decision already made. Kept separate so a retry can
  // redo that exact choice without re-asking the person to decide again.
  const [failedResolution, setFailedResolution] = useState(null); // { fileId, driveSavedAt, choice }
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readFlags().lastSyncedAt);

  const tokenClientRef = useRef(null);
  const tokenRef = useRef(null);
  const fileIdRef = useRef(readFlags().fileId);
  const pushTimerRef = useRef(null);
  // The routine autosync's own retry-with-backoff timer, deliberately kept
  // separate from pushTimerRef (the plain debounce): the effect that owns
  // pushTimerRef re-runs on every people/relationships change and would
  // wrongly cancel a legitimately in-flight retry if the two shared a timer
  // or a cleanup path -- see the effect below for why this one is only ever
  // cleared on unmount or sign-out, never as a side effect of an edit
  // arriving mid-backoff.
  const pushRetryTimerRef = useRef(null);
  const readyRef = useRef(false); // true once the initial handshake (or its conflict) has resolved

  const ensureTokenClient = useCallback(async () => {
    if (tokenClientRef.current) return tokenClientRef.current;
    const google = await waitForGoogleIdentity();
    tokenClientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: () => {}, // replaced per-request by requestToken()
    });
    return tokenClientRef.current;
  }, []);

  // Runs once a token is in hand, whether this is a brand-new sign-in or a
  // silent reauth on page load: find out what Drive has, decide what that
  // means against what THIS device remembers, and either carry it out
  // quietly or hand the choice to the person. Returns the decided action so
  // callers (signIn, the silent-reauth effect) can settle `status`
  // accurately instead of guessing from `readyRef` alone — in particular,
  // landing on 'ask' does NOT mean the handshake is unsettled the way an
  // actual failure would; it means a decision is now genuinely pending, and
  // callers need to be able to tell the two apart.
  const runHandshake = useCallback(
    async (token) => {
      const remote = await findAppDataFile(token);
      fileIdRef.current = remote?.id || null;
      const flags = readFlags();

      const localHasContent = !emptyGraph(people, relationships);
      const driveHasContent = Boolean(remote);

      const action = decideSyncAction({
        localHasContent,
        driveHasContent,
        driveSavedAt: remote?.modifiedTime || null,
        lastSyncedAt: flags.lastSyncedAt,
      });

      if (action === 'noop') {
        readyRef.current = true;
        return action;
      }

      if (action === 'download') {
        const payload = await downloadAppDataFile(token, remote.id);
        // Silent: nothing on this device to lose, no choice the person
        // actually made, so this must not become an undo step -- see the
        // comment on replaceGraph in useFamilyTree.js.
        replaceGraph(payload, { history: false });
        const syncedAt = remote.modifiedTime;
        setLastSyncedAt(syncedAt);
        writeFlags({ signedIn: true, fileId: remote.id, lastSyncedAt: syncedAt });
        readyRef.current = true;
        pushToast?.("Loaded this tree from your Google Drive.", 'success', 4000);
        return action;
      }

      if (action === 'upload') {
        const saved = await uploadAppDataFile(token, fileIdRef.current, {
          people,
          relationships,
          savedAt: new Date().toISOString(),
        });
        fileIdRef.current = saved.id;
        const syncedAt = saved.modifiedTime || new Date().toISOString();
        setLastSyncedAt(syncedAt);
        writeFlags({ signedIn: true, fileId: saved.id, lastSyncedAt: syncedAt });
        readyRef.current = true;
        return action;
      }

      // action === 'ask': hand it to the person. Nothing is written on
      // either side until they answer — a wrong guess here is exactly the
      // kind of surprise the whole sync design exists to avoid. Any earlier
      // failed-resolution memory is stale the moment a FRESH conflict shows
      // up (a new handshake means a new decision to make, not a retry of
      // the last one).
      setFailedResolution(null);
      setConflict({ driveSavedAt: remote.modifiedTime, fileId: remote.id });
      return action;
    },
    [people, relationships, replaceGraph, pushToast]
  );

  const signIn = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage(null);
    try {
      const client = await ensureTokenClient();
      const token = await requestToken(client, 'consent');
      tokenRef.current = token;
      const action = await runHandshake(token);
      // 'ask' means a decision is now pending, not that the handshake is
      // still in progress — settle on the status that actually reflects
      // that, rather than defaulting to 'signed-in' while a conflict is
      // sitting unresolved.
      setStatus(action === 'ask' ? 'conflict' : 'signed-in');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err?.message || 'Could not sign in to Google Drive.');
    }
  }, [ensureTokenClient, runHandshake]);

  // A previously-signed-in device tries a SILENT reauth on mount — no
  // popup, no consent screen — so sync resumes without asking again every
  // time the tab is reopened. This is genuinely less reliable than a
  // server-refreshed token would be (a static site has no server to hold
  // one): a browser blocking third-party storage, or the user revoking
  // access elsewhere, makes it fail, and the only fallback is showing the
  // "Sign in" button again rather than anything that fails loudly.
  useEffect(() => {
    if (!driveSyncConfigured) return;
    const flags = readFlags();
    if (!flags.signedIn) return;

    let cancelled = false;
    (async () => {
      setStatus('connecting');
      try {
        const client = await ensureTokenClient();
        const token = await requestToken(client, '');
        if (cancelled) return;
        tokenRef.current = token;
        const action = await runHandshake(token);
        // Same reasoning as signIn() above: landing on 'ask' means a
        // decision is now pending, which is a real settled state of its
        // own, not "still connecting" -- leaving status on 'connecting'
        // here is exactly the stuck-status version of the resolveConflict
        // bug this whole area is being fixed for.
        if (!cancelled) setStatus(action === 'ask' ? 'conflict' : 'signed-in');
      } catch {
        if (!cancelled) {
          // Silent reauth failing is routine, not an error the person did
          // anything to cause — fall back to signed-out quietly rather
          // than surfacing a scary message for something they can fix
          // just by clicking "Sign in" again.
          setStatus('signed-out');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once on mount — re-running this on every people/
    // relationships change would re-attempt reauth on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The actual work of carrying out a conflict choice, shared by a fresh
  // resolution (resolveConflict, reading from `conflict`) and a retry of one
  // that failed (retryResolveConflict, reading from `failedResolution`) --
  // `target` is deliberately passed in rather than read from `conflict`
  // directly, since a retry runs precisely when `conflict` has already been
  // cleared (see the catch block below).
  const performResolution = useCallback(
    async (choice, target) => {
      if (!target || !tokenRef.current) return;
      const token = tokenRef.current;
      setStatus('syncing');
      try {
        if (choice === 'use-drive') {
          const payload = await downloadAppDataFile(token, target.fileId);
          replaceGraph(payload);
          const syncedAt = target.driveSavedAt;
          setLastSyncedAt(syncedAt);
          writeFlags({ signedIn: true, fileId: target.fileId, lastSyncedAt: syncedAt });
          pushToast?.('Loaded the version from Drive.', 'success', 4000);
        } else {
          const saved = await uploadAppDataFile(token, target.fileId, {
            people,
            relationships,
            savedAt: new Date().toISOString(),
          });
          fileIdRef.current = saved.id;
          const syncedAt = saved.modifiedTime || new Date().toISOString();
          setLastSyncedAt(syncedAt);
          writeFlags({ signedIn: true, fileId: saved.id, lastSyncedAt: syncedAt });
          pushToast?.('Kept this device\u2019s tree and updated Drive to match.', 'success', 4000);
        }
        readyRef.current = true;
        setConflict(null);
        setFailedResolution(null);
        setStatus('signed-in');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err?.message || 'Could not finish syncing.');
        // The dialog that drove this choice is already closed (App.jsx
        // closes it the moment the person answers, before this even runs),
        // so `conflict` must be cleared here too -- otherwise Sidebar's
        // status panel, which hides itself whenever `conflict` is truthy on
        // the assumption that the dialog is covering the moment, would stay
        // hidden forever with nothing on screen to explain what went wrong
        // or how to recover. What DID fail is remembered instead, so a
        // retry can redo this exact choice without re-asking the person to
        // decide again -- see retryResolveConflict below.
        setConflict(null);
        setFailedResolution({ ...target, choice });
      }
    },
    [people, relationships, replaceGraph, pushToast]
  );

  const resolveConflict = useCallback(
    (choice) => {
      if (!conflict) return undefined;
      return performResolution(choice, { fileId: conflict.fileId, driveSavedAt: conflict.driveSavedAt });
    },
    [conflict, performResolution]
  );

  // Redoes a conflict resolution that failed partway through, using exactly
  // the choice the person already made (see the comment on `failedResolution`
  // above for why this doesn't re-ask). A transient network blip is the
  // expected cause, so simply repeating the same request is the right first
  // recovery -- Sidebar also offers a plain sign-in alongside this as the
  // fallback for the less common case where retrying keeps failing outright
  // (an actually expired or revoked token, say).
  const retryResolveConflict = useCallback(() => {
    if (!failedResolution) return undefined;
    const { choice, ...target } = failedResolution;
    return performResolution(choice, target);
  }, [failedResolution, performResolution]);

  // One attempt at the routine autosync push, `attempt` counting from 1 --
  // called for the original debounced push AND, recursively, for every
  // automatic retry after a failure, so both go through the exact same
  // token-refresh-then-upload logic rather than two parallel copies of it.
  //
  // TOKEN REFRESH: reactive, triggered by a failure, not a proactive timer
  // keyed off the token's own expiry. Chosen over a proactive refresh
  // because a failure is the one moment this hook actually NEEDS a working
  // token, and it can't tell in advance whether the current one has quietly
  // expired (Google's are typically ~1hr) or the network itself is the
  // problem -- so rather than tracking expiry timestamps and clock drift
  // for a proactive timer, every attempt after the first tries a silent
  // reauth (the same popup-free flow the mount-time reauth uses) before
  // retrying the upload. If the token was the problem, this fixes it on the
  // very next attempt; if it wasn't, the silent reauth is cheap to fail and
  // the upload attempt still runs (and still fails) its own way, still
  // counted and backed off like any other failed attempt.
  const attemptPush = useCallback(
    async (attempt) => {
      let token = tokenRef.current;
      if (!token) return; // signed out mid-flight -- nothing to push with

      if (attempt > 1) {
        try {
          const client = await ensureTokenClient();
          token = await requestToken(client, '');
          tokenRef.current = token;
        } catch {
          // Best-effort -- see the TOKEN REFRESH comment above. Falls
          // through to try the upload with whatever token is still on hand.
        }
      }

      setStatus('syncing');
      try {
        const saved = await uploadAppDataFile(token, fileIdRef.current, {
          people,
          relationships,
          savedAt: new Date().toISOString(),
        });
        fileIdRef.current = saved.id;
        const syncedAt = saved.modifiedTime || new Date().toISOString();
        setLastSyncedAt(syncedAt);
        writeFlags({ signedIn: true, fileId: saved.id, lastSyncedAt: syncedAt });
        setStatus('signed-in');
      } catch (err) {
        if (attempt >= PUSH_MAX_ATTEMPTS) {
          // UPPER BOUND: give up rather than retry forever. An actually
          // revoked token and a network that's down for longer than the
          // backoff schedule covers look identical from here (a request
          // that keeps failing), and both need a person to notice and act,
          // not an autosync loop quietly hammering the same failing call.
          // Recovery from here is manual -- signing in again both forces a
          // fresh (non-silent) token and re-runs the full handshake, rather
          // than this hook guessing at what else to try.
          setStatus('error');
          setErrorMessage(
            `Couldn't sync to Google Drive after several tries (${
              err?.message || 'connection problem'
            }). Sign in again to retry.`
          );
          return;
        }
        // Not giving up yet -- back off further each time so a real outage
        // doesn't turn into a tight retry loop. `status` stays 'syncing'
        // for the whole chain, including the wait between attempts: it's
        // still an accurate description ("sync is in progress, one way or
        // another"), and it keeps the routine-push effect below from
        // treating this as settled and scheduling a second, competing push.
        pushRetryTimerRef.current = setTimeout(() => {
          attemptPush(attempt + 1);
        }, pushRetryDelay(attempt));
      }
    },
    [people, relationships, ensureTokenClient]
  );

  // Cancels a retry that's mid-backoff only on unmount or sign-out (see
  // signOut below) -- NOT as part of the routine-push effect's own cleanup,
  // even though that effect re-runs on every people/relationships change.
  // That effect bails out immediately whenever status isn't 'signed-in'
  // (see below), which is true for the ENTIRE duration of a retry chain, so
  // an edit arriving mid-backoff must not cancel the pending retry it would
  // otherwise never get a chance to reschedule.
  useEffect(() => () => clearTimeout(pushRetryTimerRef.current), []);

  // Routine autosync: once the initial handshake is settled and nothing is
  // waiting on a person's answer, push whenever the tree changes —
  // debounced, since this is a network call on every structural edit
  // otherwise, not a synchronous local write like the localStorage copy.
  useEffect(() => {
    if (status !== 'signed-in' || !readyRef.current || conflict) return undefined;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);

    pushTimerRef.current = setTimeout(() => {
      attemptPush(1);
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(pushTimerRef.current);
  }, [people, relationships, status, conflict, attemptPush]);

  const signOut = useCallback(() => {
    const token = tokenRef.current;
    if (token && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    clearTimeout(pushRetryTimerRef.current);
    tokenRef.current = null;
    readyRef.current = false;
    fileIdRef.current = null;
    setConflict(null);
    setFailedResolution(null);
    setErrorMessage(null);
    setLastSyncedAt(null);
    writeFlags({ signedIn: false, fileId: null, lastSyncedAt: null });
    setStatus('signed-out');
  }, []);

  return {
    configured: driveSyncConfigured,
    status,
    errorMessage,
    conflict,
    failedResolution,
    lastSyncedAt,
    signIn,
    signOut,
    resolveConflict,
    retryResolveConflict,
  };
}
