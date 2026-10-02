import { describe, expect, it } from 'vitest';
import {
  boardKeyCommand,
  describePerson,
  neighbour,
  nextCurrent,
  revealView,
  rowsOf,
  startingPerson,
} from './boardNav';

const at = (x, y, extra = {}) => ({ position: { x, y }, ...extra });

// Two grandparents on top, three in the middle row (out of order on
// purpose), one child at the bottom.
const people = {
  gpa: at(300, 100, { firstName: 'Gus' }),
  gma: at(100, 100, { firstName: 'Gia' }),
  mum: at(500, 310, { firstName: 'Mia' }),
  dad: at(100, 310, { firstName: 'Dan' }),
  aunt: at(300, 312, { firstName: 'Ada' }),
  kid: at(420, 520, { firstName: 'Kit' }),
};

describe('board focus order (M5)', () => {
  it('groups cards into rows top to bottom, each read left to right', () => {
    expect(rowsOf(people).map((row) => row.map((c) => c.id))).toEqual([
      ['gma', 'gpa'],
      ['dad', 'aunt', 'mum'],
      ['kid'],
    ]);
  });

  it('starts at the selected person, otherwise the first in reading order', () => {
    expect(startingPerson(people, ['mum'])).toBe('mum');
    expect(startingPerson(people, ['gone', 'kid'])).toBe('kid');
    expect(startingPerson(people, [])).toBe('gma');
    expect(startingPerson({}, [])).toBeNull();
  });

  it('left and right stay in the row and stop at its ends', () => {
    expect(neighbour(people, 'aunt', 'left')).toBe('dad');
    expect(neighbour(people, 'aunt', 'right')).toBe('mum');
    expect(neighbour(people, 'dad', 'left')).toBeNull();
    expect(neighbour(people, 'mum', 'right')).toBeNull();
  });

  it('up and down go to the nearest card in the next row', () => {
    expect(neighbour(people, 'kid', 'up')).toBe('mum'); // 420 is nearer 500 than 300
    expect(neighbour(people, 'aunt', 'up')).toBe('gpa');
    expect(neighbour(people, 'dad', 'down')).toBe('kid');
    expect(neighbour(people, 'gma', 'up')).toBeNull();
    expect(neighbour(people, 'kid', 'down')).toBeNull();
  });

  it('home and end jump to the ends of the row', () => {
    expect(neighbour(people, 'mum', 'home')).toBe('dad');
    expect(neighbour(people, 'dad', 'end')).toBe('mum');
    expect(neighbour(people, 'dad', 'home')).toBeNull();
  });

  it('the first key press lands on the starting person; the edge keeps you put', () => {
    expect(nextCurrent(people, null, [], 'right')).toBe('gma');
    expect(nextCurrent(people, 'deleted-id', ['aunt'], 'down')).toBe('aunt');
    expect(nextCurrent(people, 'gma', [], 'right')).toBe('gpa');
    expect(nextCurrent(people, 'gpa', [], 'right')).toBe('gpa');
  });
});

describe('board key handling (M5)', () => {
  const key = (k, mods = {}) => boardKeyCommand({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('maps arrows, Home and End to moves; Shift+arrow extends the selection', () => {
    expect(key('ArrowLeft')).toEqual({ type: 'move', direction: 'left', extend: false });
    expect(key('ArrowDown', { shiftKey: true })).toEqual({ type: 'move', direction: 'down', extend: true });
    expect(key('Home', { shiftKey: true })).toEqual({ type: 'move', direction: 'home', extend: false });
    expect(key('End')).toEqual({ type: 'move', direction: 'end', extend: false });
  });

  it('Enter edits, Space toggles, Shift+F10 and the Menu key open the menu', () => {
    expect(key('Enter')).toEqual({ type: 'edit' });
    expect(key(' ')).toEqual({ type: 'toggle' });
    expect(key('F10', { shiftKey: true })).toEqual({ type: 'menu' });
    expect(key('ContextMenu')).toEqual({ type: 'menu' });
  });

  it("leaves the app's own shortcuts and anything with Ctrl, Cmd or Alt alone", () => {
    expect(key('Delete')).toBeNull();
    expect(key('Escape')).toBeNull();
    expect(key('z', { ctrlKey: true })).toBeNull();
    expect(key('ArrowLeft', { metaKey: true })).toBeNull();
    expect(key('ArrowLeft', { altKey: true })).toBeNull();
    expect(key('F10')).toBeNull();
    expect(key('Enter', { shiftKey: true })).toBeNull();
  });
});

describe('describePerson', () => {
  it('reads the name, years and selection', () => {
    expect(describePerson({ firstName: 'Ann', lastName: 'Lee', birthYear: '1950' }, true)).toBe(
      'Ann Lee, b. 1950, selected'
    );
    expect(describePerson({ firstName: 'Bo', living: false, birthYear: '1900', deathYear: '1980' }, false)).toBe(
      'Bo, 1900 – 1980, no longer living'
    );
    expect(describePerson(null, false)).toBe('');
  });
});

describe('revealView', () => {
  const size = { width: 800, height: 600 };
  const view = { x: 0, y: 0, scale: 1 };

  it('leaves the view alone when the card is already on screen', () => {
    expect(revealView(view, size, { x: 400, y: 300 })).toBe(view);
  });

  it('pans just far enough to bring an off-screen card in', () => {
    // Card's right edge at 1000 + 79; it should end 24 px inside 800.
    const next = revealView(view, size, { x: 1000, y: 300 });
    expect(next.x).toBe(800 - 24 - 1079);
    expect(next.y).toBe(0);
    const up = revealView(view, size, { x: 400, y: -200 });
    expect(up.y).toBe(24 - (-200 - 46));
  });

  it('takes the zoom into account', () => {
    const zoomed = { x: 0, y: 0, scale: 0.5 };
    expect(revealView(zoomed, size, { x: 1200, y: 300 })).toBe(zoomed); // 600 px on screen
  });
});
