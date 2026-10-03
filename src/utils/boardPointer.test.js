import { describe, expect, it } from 'vitest';
import { clickAction, movedPast, pressMode } from './boardPointer';

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
