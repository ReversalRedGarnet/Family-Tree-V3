// @vitest-environment jsdom
//
// useDriveSync manages a small state machine (status/conflict/
// failedResolution) around Google Drive reconciliation. This test exercises
// the exact regression a prior audit found: a failed conflict RESOLUTION (as
// opposed to a freshly detected conflict still awaiting a decision) used to
// leave `conflict` truthy forever, which made Sidebar's status panel hide
// itself with nothing on screen to explain what went wrong or how to
// recover. It also covers the sibling bug in the same area: landing on
// 'ask' during sign-in used to leave `status` on something that didn't
// reflect a conflict actually being open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const { findAppDataFile, downloadAppDataFile, uploadAppDataFile } = vi.hoisted(() => ({
  findAppDataFile: vi.fn(),
  downloadAppDataFile: vi.fn(),
  uploadAppDataFile: vi.fn(),
}));

vi.mock('../utils/driveConfig', async () => {
  const actual = await vi.importActual('../utils/driveConfig');
  return { ...actual, isConfigured: () => true };
});

// The pure reconciliation decision (decideSyncAction) is exercised on its
// own in driveSync.test.js -- kept real here too, only the network-touching
// calls are faked.
vi.mock('../utils/driveSync', async () => {
  const actual = await vi.importActual('../utils/driveSync');
  return { ...actual, findAppDataFile, downloadAppDataFile, uploadAppDataFile };
});

import { useDriveSync, PUSH_DEBOUNCE_MS, PUSH_MAX_ATTEMPTS, PUSH_RETRY_MAX_MS } from './useDriveSync';

// A minimal stand-in for the real Google Identity Services token client:
// requestAccessToken resolves whatever callback requestToken() most
// recently installed, asynchronously -- the same shape the real API has.
function installFakeGoogleIdentity() {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => {
          const client = {
            callback: () => {},
            requestAccessToken: () => {
              Promise.resolve().then(() => client.callback({ access_token: 'test-token' }));
            },
          };
          return client;
        },
        revoke: (_token, cb) => cb?.(),
      },
    },
  };
}

const REMOTE_FILE_ID = 'remote-file-1';
const DRIVE_SAVED_AT = '2024-01-01T00:00:00.000Z';

describe('useDriveSync conflict resolution failure path', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installFakeGoogleIdentity();
    findAppDataFile.mockReset();
    downloadAppDataFile.mockReset();
    uploadAppDataFile.mockReset();
    // Both sides have content and this device has never synced before, so
    // the handshake lands on 'ask' -- see decideSyncAction's own tests in
    // driveSync.test.js for the pure decision this drives.
    findAppDataFile.mockResolvedValue({ id: REMOTE_FILE_ID, modifiedTime: DRIVE_SAVED_AT });
  });

  afterEach(() => {
    delete window.google;
  });

  it('surfaces a failed resolution as a recoverable error instead of leaving `conflict` stuck', async () => {
    const { result, unmount } = renderHook(() =>
      useDriveSync({
        people: { a: { id: 'a' } },
        relationships: {},
        replaceGraph: vi.fn(),
        pushToast: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.signIn();
    });

    // Landing on 'ask' during sign-in settles on a status that actually
    // reflects a conflict being open, not a leftover guess -- the loose end
    // from the same bug class, fixed alongside the main one.
    expect(result.current.status).toBe('conflict');
    expect(result.current.conflict).toEqual({ driveSavedAt: DRIVE_SAVED_AT, fileId: REMOTE_FILE_ID });
    expect(result.current.failedResolution).toBeNull();

    uploadAppDataFile.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      await result.current.resolveConflict('keep-local');
    });

    // The core bug: `conflict` must NOT still be truthy here, or Sidebar's
    // SyncStatus (which hides its entire panel whenever `conflict` is set)
    // would show nothing at all -- no error, no way to recover short of a
    // reload.
    expect(result.current.conflict).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('network down');
    // What failed is remembered so a retry can redo the SAME choice rather
    // than re-asking the person to decide again.
    expect(result.current.failedResolution).toEqual({
      fileId: REMOTE_FILE_ID,
      driveSavedAt: DRIVE_SAVED_AT,
      choice: 'keep-local',
    });

    uploadAppDataFile.mockResolvedValueOnce({ id: REMOTE_FILE_ID, modifiedTime: '2024-02-01T00:00:00.000Z' });

    await act(async () => {
      await result.current.retryResolveConflict();
    });

    // Recovery is possible: retrying redoes exactly the choice that failed,
    // reusing the remembered fileId, and lands back on a clean signed-in
    // state with nothing stuck.
    expect(uploadAppDataFile).toHaveBeenLastCalledWith(
      'test-token',
      REMOTE_FILE_ID,
      expect.objectContaining({ people: { a: { id: 'a' } }, relationships: {} })
    );
    expect(result.current.status).toBe('signed-in');
    expect(result.current.conflict).toBeNull();
    expect(result.current.failedResolution).toBeNull();

    unmount();
  });

  it('lets a retry fail again without losing the ability to recover', async () => {
    const { result, unmount } = renderHook(() =>
      useDriveSync({
        people: { a: { id: 'a' } },
        relationships: {},
        replaceGraph: vi.fn(),
        pushToast: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.signIn();
    });

    uploadAppDataFile.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await result.current.resolveConflict('keep-local');
    });
    expect(result.current.failedResolution).not.toBeNull();

    // A second failure in a row must leave the system in exactly the same
    // recoverable shape as the first -- not stuck, not missing the choice
    // to retry again.
    uploadAppDataFile.mockRejectedValueOnce(new Error('still down'));
    await act(async () => {
      await result.current.retryResolveConflict();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('still down');
    expect(result.current.failedResolution).toEqual({
      fileId: REMOTE_FILE_ID,
      driveSavedAt: DRIVE_SAVED_AT,
      choice: 'keep-local',
    });

    unmount();
  });
});

// The routine (non-conflict) autosync push: a prior audit found this path
// had no retry at all -- one failed push (a transient network blip, or an
// OAuth token that quietly expired mid-session) flipped `status` to 'error'
// and nothing ever tried again, silently, until the person noticed and
// signed in by hand. These tests drive the hook through fake timers so the
// backoff schedule (seconds to over a minute between attempts) doesn't
// actually have to elapse in real time.
describe('useDriveSync routine autosync retry/backoff', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installFakeGoogleIdentity();
    findAppDataFile.mockReset();
    downloadAppDataFile.mockReset();
    uploadAppDataFile.mockReset();
    // Both sides empty -- decideSyncAction lands on 'noop', which settles
    // the handshake straight to 'signed-in' with nothing pending, so the
    // routine autosync effect is the only thing left to exercise.
    findAppDataFile.mockResolvedValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.google;
  });

  it('retries a failed push with backoff and recovers once a later attempt succeeds', async () => {
    uploadAppDataFile
      .mockRejectedValueOnce(new Error('network blip 1'))
      .mockRejectedValueOnce(new Error('network blip 2'))
      .mockResolvedValueOnce({ id: 'file-1', modifiedTime: '2024-03-01T00:00:00.000Z' });

    const { result, unmount } = renderHook(() =>
      useDriveSync({ people: {}, relationships: {}, replaceGraph: vi.fn(), pushToast: vi.fn() })
    );

    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.status).toBe('signed-in');

    // The initial debounce -- attempt 1, which fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(uploadAppDataFile).toHaveBeenCalledTimes(1);
    // Not given up after just one failure: still (quietly) retrying, not a
    // visible error yet.
    expect(result.current.status).toBe('syncing');
    expect(result.current.errorMessage).toBeNull();

    // One generous cumulative jump covers both remaining backoff waits
    // rather than trying to land on each one precisely: the backoff delay
    // is randomised (see pushRetryDelay's jitter) and grows with every
    // attempt, so stepping forward by exactly one attempt's worth of time
    // at a time is exactly the kind of exact-timing assumption that makes a
    // test flaky. What actually matters -- that attempt 2 and then attempt
    // 3 each eventually fire on their own, unprompted, is what the final
    // call count and status below confirm.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_RETRY_MAX_MS * 2);
    });

    // Attempt 3 succeeded (the third mocked resolution): recovered cleanly,
    // no error left behind from the two attempts that failed along the way,
    // and no MORE than three calls -- the chain stopped once it succeeded.
    expect(uploadAppDataFile).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('signed-in');
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });

  it('refreshes the token before a retry, not before the first attempt', async () => {
    // The hook caches ONE token client for its whole lifetime (see
    // ensureTokenClient), reusing it for both the original sign-in request
    // and any later silent reauth -- so what distinguishes them is the
    // `prompt` each individual requestAccessToken call is made with, not
    // which client made it. Tracked here from before signIn() even runs, so
    // the very first (consent) call is captured too.
    const prompts = [];
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => {
            const client = {
              callback: () => {},
              requestAccessToken: ({ prompt }) => {
                prompts.push(prompt);
                Promise.resolve().then(() => client.callback({ access_token: 'test-token' }));
              },
            };
            return client;
          },
          revoke: (_token, cb) => cb?.(),
        },
      },
    };

    uploadAppDataFile
      .mockRejectedValueOnce(new Error('token expired'))
      .mockResolvedValueOnce({ id: 'file-1', modifiedTime: '2024-03-01T00:00:00.000Z' });

    const { result, unmount } = renderHook(() =>
      useDriveSync({ people: {}, relationships: {}, replaceGraph: vi.fn(), pushToast: vi.fn() })
    );

    await act(async () => {
      await result.current.signIn();
    });
    expect(prompts).toEqual(['consent']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    // Attempt 1 (the original debounced push) must NOT have refreshed the
    // token -- it only just got one from signIn() moments ago, and reuses
    // it as-is.
    expect(prompts).toEqual(['consent']);
    expect(uploadAppDataFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_RETRY_MAX_MS);
    });
    // Attempt 2 (the retry) must have refreshed the token first, silently
    // (prompt: ''), the same popup-free flow the mount-time reauth uses --
    // never the full consent popup signIn() uses.
    expect(prompts).toEqual(['consent', '']);
    expect(uploadAppDataFile).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('signed-in');

    unmount();
  });

  it('gives up after PUSH_MAX_ATTEMPTS and stops retrying, surfacing a real error', async () => {
    uploadAppDataFile.mockRejectedValue(new Error('still down'));

    const { result, unmount } = renderHook(() =>
      useDriveSync({ people: {}, relationships: {}, replaceGraph: vi.fn(), pushToast: vi.fn() })
    );

    await act(async () => {
      await result.current.signIn();
    });

    // Attempt 1 (the debounce) plus every automatic retry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    for (let i = 1; i < PUSH_MAX_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PUSH_RETRY_MAX_MS);
      });
    }

    expect(uploadAppDataFile).toHaveBeenCalledTimes(PUSH_MAX_ATTEMPTS);
    // Given up: a real, visible error, not a silent stuck 'syncing'.
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/still down/);
    expect(result.current.errorMessage).toMatch(/sign in again/i);

    // THE UPPER BOUND, proven, not just asserted: advancing well past every
    // remaining possible backoff window must not produce another call --
    // this is what tells "gave up" apart from "just retrying very slowly."
    const callsBeforeWaiting = uploadAppDataFile.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_RETRY_MAX_MS * 3);
    });
    expect(uploadAppDataFile).toHaveBeenCalledTimes(callsBeforeWaiting);

    unmount();
  });
});
