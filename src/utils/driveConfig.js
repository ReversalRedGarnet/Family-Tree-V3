// The ONE thing you have to fill in yourself before Drive sync works: a
// Google Cloud OAuth client ID. It is not a secret — this flow never uses a
// client secret at all, only this ID, so committing it to a public repo is
// normal and safe (it's the same as any other OAuth client ID shipped in a
// browser app). See the "Google Drive sync" section in README.md for the
// exact steps to get one.
//
// Until this is replaced, DriveSync.isConfigured() returns false and the
// app quietly hides the "Sign in" button rather than showing one that can
// only fail.
export const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

// drive.appdata is the narrowest scope Drive offers: a folder that's
// invisible in the user's normal Drive UI and, per Google's own scope
// documentation, entirely hidden from and inaccessible to any other app —
// including a human browsing their own Drive. Nothing else this app could
// ask for gets it access to a single file the user didn't create through
// it.
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// The file this app keeps in that hidden folder. One file, one tree — this
// app was never designed to hold more than one tree at a time locally
// either, so Drive doesn't invent a multi-tree feature the rest of the app
// doesn't have.
export const DRIVE_FILE_NAME = 'family-tree-v3.json';

export function isConfigured() {
  return typeof GOOGLE_CLIENT_ID === 'string' && !GOOGLE_CLIENT_ID.startsWith('YOUR_CLIENT_ID');
}
