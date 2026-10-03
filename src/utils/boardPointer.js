// What a primary-button press on the empty board turns into. Pure, so the
// rules can be tested without a canvas.
//
// The mode is fixed at the moment the button goes down and never changes
// mid-gesture: letting go of Shift halfway through a selection box doesn't
// turn it into a pan. Nothing happens at all until the pointer has moved
// past the click-wobble threshold, so a slightly shaky click is still a
// click.

// 'select': the armed "Select multiple" tool's box. 'marquee': the Shift +
// drag selection box. 'pan': move the board.
export function pressMode({ shiftKey, armed = false }) {
  if (armed) return 'select';
  return shiftKey ? 'marquee' : 'pan';
}

// What a click (a press that never moved) on empty board does:
//   'none'   -- it was the click that closed an open menu, nothing else;
//   'disarm' -- "Select multiple" was armed: just cancel it;
//   'clear'  -- someone is selected: just clear the selection;
//   'menu'   -- nobody is selected: open the small board menu there.
export function clickAction({ menuWasOpen, armed = false, hasSelection }) {
  if (menuWasOpen) return 'none';
  if (armed) return 'disarm';
  if (hasSelection) return 'clear';
  return 'menu';
}

// What a finished selection box does with the people it caught. The Shift
// box always replaces the selection (catching nobody clears it, as it
// always has). The armed tool is one-shot: it always disarms, and only
// changes the selection if it caught someone.
export function boxResult(mode, ids) {
  if (mode === 'select') return { select: ids.length ? ids : null, disarm: true };
  return { select: ids, disarm: false };
}

// The hint at the top of the board, or null for none.
export function chipText({ armed, selectedCount }) {
  if (armed) return 'Drag to select people · Esc to cancel';
  if (selectedCount > 0) return `${selectedCount} selected · drag to move · Esc or click empty space to clear`;
  return null;
}

// Whether the pointer has moved far enough from where it went down for the
// press to stop being a click.
export function movedPast(start, point, threshold) {
  return Math.hypot(point.x - start.x, point.y - start.y) >= threshold;
}
