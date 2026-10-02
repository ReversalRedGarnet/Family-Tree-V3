// @vitest-environment jsdom
//
// Drive sync exactly as it ships: no client ID configured, nothing mocked.
// Nothing may reach Google in this state (M8).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { useDriveSync, GOOGLE_IDENTITY_SRC } from './useDriveSync';

afterEach(() => {
  window.localStorage.clear();
});

describe('Drive sync unconfigured (M8)', () => {
  it('index.html loads nothing from Google', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+accounts\.google\.com/);
  });

  it('mounting the hook adds no Google script and makes no request, even with old sign-in flags', async () => {
    window.localStorage.setItem('family-tree/drive-sync/v1', JSON.stringify({ signedIn: true, fileId: 'f', lastSyncedAt: null }));
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async () => {
      throw new Error('no network expected');
    });
    const { result, unmount } = renderHook(() =>
      useDriveSync({ people: {}, relationships: {}, replaceGraph: vi.fn(), pushToast: vi.fn() })
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.configured).toBe(false);
    expect(result.current.canReconnect).toBe(false);
    expect([...document.querySelectorAll('script')].some((s) => s.src === GOOGLE_IDENTITY_SRC)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    unmount();
    fetchSpy.mockRestore();
  });
});
