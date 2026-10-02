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
