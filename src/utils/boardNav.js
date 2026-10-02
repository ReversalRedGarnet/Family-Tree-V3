// Keyboard access to the board. The cards are drawn on a canvas, so the
// browser can't Tab between them; instead the board is one Tab stop with a
// "current person" that the keys below move around. Everything here is
// pure, so the rules can be tested without a canvas.

import { CARD_HEIGHT, CARD_WIDTH } from './constants';
import { formatName } from './names';
import { formatLifespan } from './dates';

const posOf = (person) => ({ x: person.position?.x ?? 0, y: person.position?.y ?? 0 });

// Cards rest on generation rows, so people are grouped into rows top to
// bottom, each read left to right. Cards within half a card's height of a
// row's first card count as that row, so a slightly-off card still belongs.
export function rowsOf(people) {
  const cards = Object.entries(people)
    .map(([id, person]) => ({ id, ...posOf(person) }))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
  const rows = [];
  for (const card of cards) {
    const row = rows[rows.length - 1];
    if (row && card.y - row[0].y <= CARD_HEIGHT / 2) row.push(card);
    else rows.push([card]);
  }
  rows.forEach((row) => row.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1)));
  return rows;
}

// Where the keyboard starts: whoever is selected, otherwise the first
// person in reading order.
export function startingPerson(people, selectedIds = []) {
  const selected = selectedIds.find((id) => people[id]);
  if (selected) return selected;
  return rowsOf(people)[0]?.[0]?.id ?? null;
}

// The person one step from `fromId` in `direction` (left, right, up, down,
// home, end), or null when there's nobody that way. Left/right stay in the
// row; up/down go to the nearest card (by x) in the next row with anyone in
// it; home/end are the ends of the current row.
export function neighbour(people, fromId, direction) {
  const rows = rowsOf(people);
  const r = rows.findIndex((row) => row.some((c) => c.id === fromId));
  if (r === -1) return null;
  const row = rows[r];
  const i = row.findIndex((c) => c.id === fromId);

  if (direction === 'left') return row[i - 1]?.id ?? null;
  if (direction === 'right') return row[i + 1]?.id ?? null;
  if (direction === 'home') return i > 0 ? row[0].id : null;
  if (direction === 'end') return i < row.length - 1 ? row[row.length - 1].id : null;

  const target = rows[direction === 'up' ? r - 1 : direction === 'down' ? r + 1 : -1];
  if (!target) return null;
  const x = row[i].x;
  let best = target[0];
  for (const c of target) if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
  return best.id;
}

// Where a move key lands. With no valid current person yet, the first
// press lands on the starting person rather than stepping past them; at the
// edge of the board it stays put.
export function nextCurrent(people, currentId, selectedIds, direction) {
  if (!currentId || !people[currentId]) return startingPerson(people, selectedIds);
  return neighbour(people, currentId, direction) ?? currentId;
}

const MOVE_KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

// Turns a keydown on the board into a command, or null to leave the key
// alone (Ctrl+Z, Delete and Escape are the app's own shortcuts, handled
// elsewhere exactly as before).
export function boardKeyCommand(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) return { type: 'menu' };
  const direction = MOVE_KEYS[e.key];
  if (direction) return { type: 'move', direction, extend: e.shiftKey && direction !== 'home' && direction !== 'end' };
  if (e.shiftKey) return null;
  if (e.key === 'Enter') return { type: 'edit' };
  if (e.key === ' ' || e.key === 'Spacebar') return { type: 'toggle' };
  return null;
}

// Whether Space is the board's own key: the board itself has focus, or
// nothing does. Then a Space press does nothing but get ready to pan. On
// any other control Space still does that control's job (presses a button,
// ticks a checkbox), unless a Space+drag pan happens before it's released.
export function spacePansBoard(active, board, body) {
  return !active || active === body || (Boolean(board) && active === board);
}

const NOT_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image']);

// Space typed into a text field (or opening a <select>) is never a pan.
export function spaceTypesText(active) {
  if (!active) return false;
  if (active.isContentEditable) return true;
  if (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') return true;
  return active.tagName === 'INPUT' && !NOT_TEXT_INPUTS.has(String(active.type).toLowerCase());
}

// What an arrow key does. With focus on the board, or on nothing, it moves
// between people while a person is in play (someone is selected, or the
// keyboard ring is on someone), and otherwise pans the board. With focus on
// any other control the key is that control's.
export function arrowKeyAction(focus, personInPlay) {
  if (focus !== 'board' && focus !== 'nothing') return null;
  return personInPlay ? 'people' : 'pan';
}

const PAN_DIRECTIONS = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

// How far the view moves for an arrow key: the board moves the opposite
// way to the key, so ArrowRight brings in what's to the right, like
// scrolling. Null for any other key.
export function arrowPanDelta(key, step) {
  const dir = PAN_DIRECTIONS[key];
  if (!dir) return null;
  return { dx: dir[0] * step, dy: dir[1] * step };
}

// What the live region reads out for the current person.
export function describePerson(person, selected) {
  if (!person) return '';
  const lifespan = formatLifespan(person);
  return [formatName(person), lifespan, person.living === false ? 'no longer living' : null, selected ? 'selected' : null]
    .filter(Boolean)
    .join(', ');
}

// The view, shifted just enough that the card at `pos` sits inside the
// visible board with `margin` pixels to spare. Unchanged (the same object)
// when it's already in view, so callers can skip a re-render.
export function revealView(view, size, pos, margin = 24) {
  const halfW = (CARD_WIDTH / 2) * view.scale;
  const halfH = (CARD_HEIGHT / 2) * view.scale;
  const cx = pos.x * view.scale + view.x;
  const cy = pos.y * view.scale + view.y;
  const shift = (centre, half, extent) => {
    if (centre - half < margin) return margin - (centre - half);
    if (centre + half > extent - margin) return Math.max(extent - margin - (centre + half), margin - (centre - half));
    return 0;
  };
  const dx = shift(cx, halfW, size.width);
  const dy = shift(cy, halfH, size.height);
  if (!dx && !dy) return view;
  return { ...view, x: view.x + dx, y: view.y + dy };
}
