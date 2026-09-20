import { describe, it, expect } from 'vitest';
import { decideSyncAction, buildMultipartBody } from './driveSync';

describe('decideSyncAction', () => {
  it('does nothing when both sides are empty', () => {
    expect(
      decideSyncAction({ localHasContent: false, driveHasContent: false, driveSavedAt: null, lastSyncedAt: null })
    ).toBe('noop');
  });

  it('uploads when Drive is empty but this device has content', () => {
    expect(
      decideSyncAction({ localHasContent: true, driveHasContent: false, driveSavedAt: null, lastSyncedAt: null })
    ).toBe('upload');
  });

  it('downloads when this device is empty but Drive has content', () => {
    expect(
      decideSyncAction({
        localHasContent: false,
        driveHasContent: true,
        driveSavedAt: '2024-01-01T00:00:00Z',
        lastSyncedAt: null,
      })
    ).toBe('download');
  });

  it('downloads even if this device has previously synced, as long as it is now empty', () => {
    expect(
      decideSyncAction({
        localHasContent: false,
        driveHasContent: true,
        driveSavedAt: '2024-01-02T00:00:00Z',
        lastSyncedAt: '2024-01-01T00:00:00Z',
      })
    ).toBe('download');
  });

  it('asks on a first sign-in with existing local data, even though nothing has technically changed', () => {
    // Both sides have content but this device has never synced before, so it
    // has no way to know whether Drive's copy is an old sync target or a
    // genuinely different history.
    expect(
      decideSyncAction({
        localHasContent: true,
        driveHasContent: true,
        driveSavedAt: '2024-01-01T00:00:00Z',
        lastSyncedAt: null,
      })
    ).toBe('ask');
  });

  it('asks when Drive has changed since this device last synced', () => {
    expect(
      decideSyncAction({
        localHasContent: true,
        driveHasContent: true,
        driveSavedAt: '2024-01-05T00:00:00Z',
        lastSyncedAt: '2024-01-01T00:00:00Z',
      })
    ).toBe('ask');
  });

  it('uploads when both have content but Drive has not changed since the last sync', () => {
    expect(
      decideSyncAction({
        localHasContent: true,
        driveHasContent: true,
        driveSavedAt: '2024-01-01T00:00:00Z',
        lastSyncedAt: '2024-01-01T00:00:00Z',
      })
    ).toBe('upload');
  });

  it('uploads when Drive has no savedAt to compare against', () => {
    expect(
      decideSyncAction({
        localHasContent: true,
        driveHasContent: true,
        driveSavedAt: null,
        lastSyncedAt: '2024-01-01T00:00:00Z',
      })
    ).toBe('upload');
  });
});

describe('buildMultipartBody', () => {
  it('wraps the metadata and content JSON in the boundary delimiters Drive expects', () => {
    const body = buildMultipartBody({ name: 'tree.json' }, '{"people":{}}', 'BOUNDARY');

    expect(body).toContain('--BOUNDARY\r\n');
    expect(body).toContain('Content-Type: application/json; charset=UTF-8\r\n\r\n{"name":"tree.json"}');
    expect(body).toContain('Content-Type: application/json\r\n\r\n{"people":{}}');
    expect(body.trim().endsWith('--BOUNDARY--')).toBe(true);
  });
});
