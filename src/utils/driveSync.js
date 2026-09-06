// Talks to Drive directly over fetch — no gapi client library, since that
// would be a lot of weight for three REST calls (list, get, upload) that
// are simple enough to make by hand.
import { GOOGLE_DRIVE_SCOPE, DRIVE_FILE_NAME } from './driveConfig';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ---- The one decision that matters: what does a sign-in (or a routine
// autosync) actually DO, given what's on Drive and what's on this device?
//
// Kept as a pure function, deliberately with no fetch or token anywhere in
// it, so the decision itself — the part actually worth getting right — can
// be checked without a live Google account. Everything network-shaped below
// this is just carrying out whatever this returns.
//
//   'noop'     — nothing to do (both empty, or nothing has changed)
//   'upload'   — push this device's tree up; Drive has nothing newer
//   'download' — pull Drive's tree down; this device has nothing to lose
//   'ask'      — both sides have something and neither is obviously the
//                one to keep; a person has to say which wins
//
// `lastSyncedAt` is the Drive `savedAt` this device saw the last time it
// successfully pushed or pulled — not a general "last used" timestamp. Its
// whole job is answering one question: has anything landed on Drive from
// SOMEWHERE ELSE since this device last looked? Which is exactly why a
// first sign-in with existing local data has no answer for that question
// yet (`lastSyncedAt` is null) and has to ask, even though nothing is
// technically a conflict — this device simply doesn't know the history.
export function decideSyncAction({ localHasContent, driveHasContent, driveSavedAt, lastSyncedAt }) {
  if (!driveHasContent) {
    return localHasContent ? 'upload' : 'noop';
  }
  if (!localHasContent) return 'download';
  if (!lastSyncedAt) return 'ask';
  if (driveSavedAt && new Date(driveSavedAt).getTime() > new Date(lastSyncedAt).getTime()) return 'ask';
  return 'upload';
}

// ---- Everything below here actually touches the network. ----

async function driveFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Drive request failed (${res.status}): ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

// The file's id and Drive's own record of when it was last written —
// `modifiedTime` is Drive's, set on every upload regardless of what our own
// payload's `savedAt` says, so it doubles as a sanity check against a
// payload that lies about its own age.
export async function findAppDataFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res = await driveFetch(
    `${FILES_URL}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=1`,
    token
  );
  const data = await res.json();
  return data.files?.[0] || null;
}

export async function downloadAppDataFile(token, fileId) {
  const res = await driveFetch(`${FILES_URL}/${fileId}?alt=media`, token);
  return res.json();
}

export function buildMultipartBody(metadata, contentJson, boundary) {
  const delim = `\r\n--${boundary}\r\n`;
  const close = `\r\n--${boundary}--`;
  return (
    delim +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delim +
    'Content-Type: application/json\r\n\r\n' +
    contentJson +
    close
  );
}

// Creates the file the first time (needs multipart so the name and the
// appDataFolder parent can go alongside the content in one request), or
// overwrites it on every call after — a simple media-only PATCH once the
// id is known, since the metadata never needs to change again.
export async function uploadAppDataFile(token, fileId, payload) {
  const contentJson = JSON.stringify(payload);

  if (fileId) {
    const res = await driveFetch(`${UPLOAD_URL}/${fileId}?uploadType=media`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: contentJson,
    });
    return res.json();
  }

  const boundary = `family_tree_${Date.now()}`;
  const body = buildMultipartBody({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] }, contentJson, boundary);
  const res = await driveFetch(`${UPLOAD_URL}?uploadType=multipart`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
}

export { GOOGLE_DRIVE_SCOPE };
