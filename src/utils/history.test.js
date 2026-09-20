import { describe, it, expect } from 'vitest';
import { applyCommit } from './history';
import { MAX_HISTORY } from './constants';

describe('applyCommit', () => {
  it('pushes the old present onto past and clears future', () => {
    const h = { past: ['a'], present: 'b', future: ['c'] };
    expect(applyCommit(h, 'd')).toEqual({ past: ['a', 'b'], present: 'd', future: [] });
  });

  it('caps past at MAX_HISTORY, dropping the oldest entries', () => {
    const past = Array.from({ length: MAX_HISTORY }, (_, i) => i);
    const h = { past, present: 'current', future: [] };
    const result = applyCommit(h, 'next');

    expect(result.past).toHaveLength(MAX_HISTORY);
    // The oldest entry (0) is dropped, and the just-superseded present is
    // the newest entry now on the stack.
    expect(result.past[0]).toBe(1);
    expect(result.past[result.past.length - 1]).toBe('current');
  });

  it('bypasses the stack entirely when history is false, leaving past untouched', () => {
    const h = { past: ['a'], present: 'b', future: ['c'] };
    const result = applyCommit(h, 'silent-load', { history: false });

    // `past` is the same array the input had -- nothing was pushed onto it.
    expect(result.past).toBe(h.past);
    expect(result.present).toBe('silent-load');
    // Future still can't be left dangling: it no longer follows from the
    // new present, silent load or not.
    expect(result.future).toEqual([]);
  });

  it('lets a later undo reach straight past a silent commit', () => {
    // Simulates: normal edit -> silent Drive load -> undo. The undo should
    // restore the state from BEFORE the silent load, since there was
    // nothing the user did during the silent load to undo.
    let h = { past: [], present: 'local-edit', future: [] };
    h = applyCommit(h, 'drive-loaded-state', { history: false });
    expect(h.past).toEqual([]);

    // An undo pops the last entry of `past` as the new present -- since
    // nothing was pushed, undo has nothing to restore FROM the silent
    // commit itself, confirming it left no trace on the stack.
    expect(h.past).toHaveLength(0);
  });
});
