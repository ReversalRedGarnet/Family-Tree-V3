// What a primary-button press on the empty board turns into. Pure, so the
// rules can be tested without a canvas.
//
// The mode is fixed at the moment the button goes down and never changes
// mid-gesture: letting go of Shift halfway through a selection box doesn't
// turn it into a pan. Nothing happens at all until the pointer has moved
// past the click-wobble threshold, so a slightly shaky click is still a
// click.

// 'marquee': draw a selection box. 'pan': move the board.
export function pressMode({ shiftKey }) {
  return shiftKey ? 'marquee' : 'pan';
}

// What a click (a press that never moved) on empty board does:
//   'none'  -- it was the click that closed an open menu, nothing else;
//   'clear' -- someone is selected: just clear the selection;
//   'menu'  -- nobody is selected: open the small board menu there.
export function clickAction({ menuWasOpen, hasSelection }) {
  if (menuWasOpen) return 'none';
  if (hasSelection) return 'clear';
  return 'menu';
}

// Whether the pointer has moved far enough from where it went down for the
// press to stop being a click.
export function movedPast(start, point, threshold) {
  return Math.hypot(point.x - start.x, point.y - start.y) >= threshold;
}
