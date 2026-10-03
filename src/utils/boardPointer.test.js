import { describe, expect, it } from 'vitest';
import { boxResult, chipText, clickAction, movedPast, pressMode } from './boardPointer';

describe('a primary press on empty board', () => {
  it('pans, unless Shift is held when the button goes down', () => {
    expect(pressMode({ shiftKey: false })).toBe('pan');
    expect(pressMode({ shiftKey: true })).toBe('marquee');
  });

  it('stays a click until the pointer has moved the threshold', () => {
    const start = { x: 100, y: 100 };
    expect(movedPast(start, { x: 102, y: 102 }, 4)).toBe(false);
    expect(movedPast(start, { x: 104, y: 100 }, 4)).toBe(true);
    expect(movedPast(start, { x: 97, y: 97 }, 4)).toBe(true);
  });
});

describe('a click on empty board', () => {
  it('opens the board menu when nobody is selected', () => {
    expect(clickAction({ menuWasOpen: false, hasSelection: false })).toBe('menu');
  });

  it('only clears the selection when someone is selected', () => {
    expect(clickAction({ menuWasOpen: false, hasSelection: true })).toBe('clear');
  });

  it('does nothing else when it was the click that closed a menu', () => {
    expect(clickAction({ menuWasOpen: true, hasSelection: false })).toBe('none');
    expect(clickAction({ menuWasOpen: true, hasSelection: true })).toBe('none');
  });
});

describe('the Select multiple tool', () => {
  it('armed, a drag on empty board is the tool, whatever Shift says', () => {
    expect(pressMode({ shiftKey: false, armed: true })).toBe('select');
    expect(pressMode({ shiftKey: true, armed: true })).toBe('select');
  });

  it('armed, a click just cancels it (no menu, no clearing)', () => {
    expect(clickAction({ menuWasOpen: false, armed: true, hasSelection: false })).toBe('disarm');
    expect(clickAction({ menuWasOpen: false, armed: true, hasSelection: true })).toBe('disarm');
  });

  it('catching someone selects them and disarms; catching nobody only disarms', () => {
    expect(boxResult('select', ['a', 'b'])).toEqual({ select: ['a', 'b'], disarm: true });
    expect(boxResult('select', [])).toEqual({ select: null, disarm: true });
  });

  it('the Shift box replaces the selection either way and never disarms', () => {
    expect(boxResult('marquee', ['a'])).toEqual({ select: ['a'], disarm: false });
    expect(boxResult('marquee', [])).toEqual({ select: [], disarm: false });
  });
});

describe('the hint chip', () => {
  it('says what the armed tool does', () => {
    expect(chipText({ armed: true, selectedCount: 0 })).toBe('Drag to select people · Esc to cancel');
    expect(chipText({ armed: true, selectedCount: 3 })).toBe('Drag to select people · Esc to cancel');
  });

  it('counts a selection and says what to do with it', () => {
    expect(chipText({ armed: false, selectedCount: 1 })).toBe('1 selected · drag to move · Esc or click empty space to clear');
    expect(chipText({ armed: false, selectedCount: 4 })).toBe('4 selected · drag to move · Esc or click empty space to clear');
  });

  it('is gone when there is nothing to say', () => {
    expect(chipText({ armed: false, selectedCount: 0 })).toBeNull();
  });
});
