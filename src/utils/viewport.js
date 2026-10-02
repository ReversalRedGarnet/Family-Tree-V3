// Zoom limits for the board, as plain functions so they can be tested
// without a canvas.

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.4;
// Below this a card is under two pixels wide; nothing useful is left.
export const ABSOLUTE_MIN_SCALE = 0.01;

// The scale at which the whole tree fits the screen.
export function fitScale(bounds, size) {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (!(w > 0) || !(h > 0) || !(size.width > 0) || !(size.height > 0)) return null;
  return Math.min(size.width / w, size.height / h);
}

// How far out you can zoom: normally MIN_SCALE, but never so far in that
// Fit can't show the whole tree. A 500-person tree is ~50,000 px wide,
// which needs about 3%.
export function minScaleFor(bounds, size) {
  const fit = fitScale(bounds, size);
  if (fit === null) return MIN_SCALE;
  return Math.max(ABSOLUTE_MIN_SCALE, Math.min(MIN_SCALE, fit));
}

export function clampScale(scale, minScale) {
  return Math.min(MAX_SCALE, Math.max(minScale, scale));
}

// ---- Wheel and trackpad ----

// Firefox reports a mouse notch as 3 lines; this makes it the same ~100 px
// a notch is in Chrome, so one notch zooms the same amount everywhere.
const LINE_PX = 100 / 3;
const PAGE_PX = 800;
// Zoom speed per pixel of wheel travel. A pinch sends many small deltas, a
// mouse notch one big one (~100 px), so they need different rates to feel
// the same: one notch is about 10%, one pinch event a few percent.
const MOUSE_ZOOM_RATE = 0.001;
const PINCH_ZOOM_RATE = 0.01;
const MAX_STEP = 2;

function inPixels(delta, deltaMode) {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

// A mouse wheel, as opposed to a trackpad. Browsers don't say, so this goes
// by what a notched wheel sends: Firefox reports it in lines; Chrome, Edge
// and Safari report vertical-only steps whose legacy wheelDeltaY is a
// multiple of 120, and at least 50 px each. Trackpad scrolls carry
// horizontal movement or small, uneven deltas.
export function isMouseWheel(evt) {
  if (evt.deltaMode === 1) return true;
  if (evt.deltaX !== 0) return false;
  const legacy = evt.wheelDeltaY;
  return Boolean(legacy) && legacy % 120 === 0 && Math.abs(evt.deltaY) >= 50;
}

// What a wheel event should do to the board:
// - a pinch (the browser sets ctrlKey on trackpad pinches) or a mouse
//   wheel zooms around the pointer, in proportion to how far it moved;
// - any other scroll pans, so two-finger scrolling on a trackpad moves
//   the board instead of zooming it, in both directions;
// - an event that moves nothing does nothing.
export function wheelAction(evt) {
  const dx = inPixels(evt.deltaX || 0, evt.deltaMode);
  const dy = inPixels(evt.deltaY || 0, evt.deltaMode);
  if (dx === 0 && dy === 0) return null;

  const mouse = isMouseWheel(evt);
  if (evt.ctrlKey || mouse) {
    if (dy === 0) return null;
    const rate = mouse ? MOUSE_ZOOM_RATE : PINCH_ZOOM_RATE;
    const factor = Math.min(MAX_STEP, Math.max(1 / MAX_STEP, Math.exp(-dy * rate)));
    return { type: 'zoom', factor };
  }
  return { type: 'pan', dx: -dx || 0, dy: -dy || 0 };
}
