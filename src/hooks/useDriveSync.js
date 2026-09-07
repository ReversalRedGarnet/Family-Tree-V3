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
const PUSH_DEBOUNCE_MS = 2500;
const SCRIPT_WAIT_TIMEOUT_MS = 10000;

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
  const [status, setStatus] = useState('signed-out'); // signed-out | connecting | signed-in | syncing | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [conflict, setConflict] = useState(null); // { driveSavedAt } while a choice is pending
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readFlags().lastSyncedAt);

  const tokenClientRef = useRef(null);
  const tokenRef = useRef(null);
  const fileIdRef = useRef(readFlags().fileId);
  const pushTimerRef = useRef(null);
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
  // quietly or hand the choice to the person.
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
        return;
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
        return;
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
        return;
      }

      // action === 'ask': hand it to the person. Nothing is written on
      // either side until they answer — a wrong guess here is exactly the
      // kind of surprise the whole sync design exists to avoid.
      setConflict({ driveSavedAt: remote.modifiedTime, fileId: remote.id });
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
      await runHandshake(token);
      setStatus((prev) => (prev === 'connecting' ? 'signed-in' : prev));
      if (readyRef.current) setStatus('signed-in');
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
        await runHandshake(token);
        if (!cancelled) setStatus(readyRef.current ? 'signed-in' : 'connecting');
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

  const resolveConflict = useCallback(
    async (choice) => {
      if (!conflict || !tokenRef.current) return;
      const token = tokenRef.current;
      setStatus('syncing');
      try {
        if (choice === 'use-drive') {
          const payload = await downloadAppDataFile(token, conflict.fileId);
          replaceGraph(payload);
          const syncedAt = conflict.driveSavedAt;
          setLastSyncedAt(syncedAt);
          writeFlags({ signedIn: true, fileId: conflict.fileId, lastSyncedAt: syncedAt });
          pushToast?.('Loaded the version from Drive.', 'success', 4000);
        } else {
          const saved = await uploadAppDataFile(token, conflict.fileId, {
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
        setStatus('signed-in');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err?.message || 'Could not finish syncing.');
      }
    },
    [conflict, people, relationships, replaceGraph, pushToast]
  );

  // Routine autosync: once the initial handshake is settled and nothing is
  // waiting on a person's answer, push whenever the tree changes —
  // debounced, since this is a network call on every structural edit
  // otherwise, not a synchronous local write like the localStorage copy.
  useEffect(() => {
    if (status !== 'signed-in' || !readyRef.current || conflict) return undefined;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);

    pushTimerRef.current = setTimeout(async () => {
      const token = tokenRef.current;
      if (!token) return;
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
        setStatus('error');
        setErrorMessage(err?.message || 'Could not sync to Google Drive.');
      }
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(pushTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, relationships, status, conflict]);

  const signOut = useCallback(() => {
    const token = tokenRef.current;
    if (token && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    tokenRef.current = null;
    readyRef.current = false;
    fileIdRef.current = null;
    setConflict(null);
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
    lastSyncedAt,
    signIn,
    signOut,
    resolveConflict,
  };
}
