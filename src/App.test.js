// @vitest-environment jsdom
//
// The whole App with its two outside-world pieces stubbed: the Konva board
// (jsdom can't draw a canvas, and nothing here is about the board) and the
// Drive hook (so a Drive conflict question can be made to arrive on cue).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const drive = vi.hoisted(() => ({
  state: {
    configured: false,
    status: 'signed-out',
    conflict: null,
    errorMessage: null,
    resolveConflict: () => {},
  },
}));

vi.mock('./components/Canvas', () => ({ default: () => null }));
vi.mock('./hooks/useDriveSync', () => ({ useDriveSync: () => drive.state }));

import App from './App';

const KEY = 'family-tree/graph/v1';
const P = (id, firstName, x) => ({ id, firstName, lastName: 'Lee', gender: 'female', living: true, position: { x, y: 120 } });

const dialogTitles = () => screen.queryAllByRole('dialog', { hidden: true }).map((d) => d.getAttribute('aria-label'));
const escape = () => fireEvent.keyDown(window, { key: 'Escape' });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ version: 1, people: { a: P('a', 'Ann', 360), b: P('b', 'Bea', 562) }, relationships: {} })
  );
  drive.state = { ...drive.state, conflict: null, resolveConflict: vi.fn() };
});

afterEach(cleanup);

function openLinkDialog() {
  fireEvent.click(screen.getByRole('button', { name: /^Ann Lee/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Bea Lee/ }), { shiftKey: true });
  fireEvent.click(screen.getAllByRole('button', { name: /Link two people/ })[0]);
  expect(dialogTitles()).toContain('How are they related?');
}

describe('Escape with stacked dialogs (F7)', () => {
  it('closes only the question on top, never the link dialog underneath', () => {
    const { rerender } = render(h(App));
    openLinkDialog();

    // A Drive conflict arrives while the link dialog is open, and is asked
    // on top of it.
    drive.state = { ...drive.state, conflict: { driveSavedAt: '2026-01-01T00:00:00Z' } };
    act(() => rerender(h(App)));
    expect(dialogTitles()).toEqual(['How are they related?', 'Different tree on Google Drive']);

    escape();

    // Escape answered the question on top ("Keep this device") ...
    expect(drive.state.resolveConflict).toHaveBeenCalledWith('keep-local');
    // ... and the link dialog underneath is still there.
    expect(dialogTitles()).toEqual(['How are they related?']);
  });

  it('a second Escape then closes the link dialog itself', () => {
    render(h(App));
    openLinkDialog();

    escape();

    expect(dialogTitles()).toEqual([]);
  });

  it('with no dialog open, Escape still clears the selection', () => {
    render(h(App));
    fireEvent.click(screen.getByRole('button', { name: /^Ann Lee/ }));
    expect(screen.getByText('1 selected')).toBeTruthy();

    escape();

    expect(screen.getByText('0 selected')).toBeTruthy();
  });
});
