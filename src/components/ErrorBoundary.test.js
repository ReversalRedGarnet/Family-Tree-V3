// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

const KEY = 'family-tree/graph/v1';

function Boom() {
  throw new Error('saved data broke rendering');
}

const renderCrashed = () => render(createElement(ErrorBoundary, null, createElement(Boom)));
const backups = () => Object.keys(window.localStorage).filter((k) => k.startsWith(`${KEY}/backup-`));

describe('ErrorBoundary recovery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('offers a backup download of the raw save', () => {
    window.localStorage.setItem(KEY, '{"version":1,"people":{"a":null}}');
    renderCrashed();
    fireEvent.click(screen.getByText('Download a backup of my data'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob.size).toBe('{"version":1,"people":{"a":null}}'.length);
  });

  it('starting fresh moves the save aside rather than deleting it', () => {
    window.localStorage.setItem(KEY, 'broken');
    renderCrashed();
    fireEvent.click(screen.getByText(/Start with an empty board/));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(backups().map((k) => window.localStorage.getItem(k))).toEqual(['broken']);
  });

  it('says so, and keeps the save, when nothing is saved to download', () => {
    renderCrashed();
    fireEvent.click(screen.getByText('Download a backup of my data'));
    expect(screen.getByText('Nothing is saved in this browser.')).toBeTruthy();
  });
});
