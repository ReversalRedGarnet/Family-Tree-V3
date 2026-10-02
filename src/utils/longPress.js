// Long-press for touch screens. iOS Safari never sends a `contextmenu`
// event for a held finger, so without this a phone or tablet had no way to
// reach a card's menu from the board. Android does send one; Canvas.jsx
// checks `pending`/`fired` so the two can't both open the menu.

export const LONG_PRESS_MS = 500;
// How far a finger may drift and still count as holding still. A card drag
// starts at 3 px and cancels the press itself, so this mostly matters on
// the empty board, where a pan starts at the first move.
export const LONG_PRESS_SLOP = 8;

export function createLongPress({
  onFire,
  delay = LONG_PRESS_MS,
  slop = LONG_PRESS_SLOP,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let timer = null;
  let origin = null;
  let fired = false;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    // A finger went down. `detail` is handed back to onFire untouched.
    start(x, y, detail) {
      stop();
      fired = false;
      origin = { x, y, detail };
      timer = setTimer(() => {
        timer = null;
        fired = true;
        onFire(origin);
      }, delay);
    },
    // Moving past the slop means it's a pan or a drag, not a hold.
    move(x, y) {
      if (timer !== null && Math.hypot(x - origin.x, y - origin.y) > slop) stop();
    },
    // Lifted, a second finger, a drag started: whatever it was, not a hold.
    cancel: stop,
    // Android's own long-press menu arrived first: it opens the menu, and
    // this press counts as fired so the tap that follows is ignored too.
    claim() {
      stop();
      fired = true;
    },
    // A hold is pending: the finger is down and the timer hasn't run out.
    get pending() {
      return timer !== null;
    },
    // This gesture already opened the menu. Stays true until the next
    // start(), so the tap and drag that end the same gesture can be ignored.
    get fired() {
      return fired;
    },
  };
}
