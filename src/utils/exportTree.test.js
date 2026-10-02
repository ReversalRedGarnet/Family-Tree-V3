import { describe, expect, it } from 'vitest';
import { computeExportScale, CANVAS_LIMITS, PREFERRED_PIXEL_RATIO } from './exportTree';

const [desktop, ios] = CANVAS_LIMITS;

describe('computeExportScale', () => {
  it('uses the preferred ratio when the board fits comfortably', () => {
    expect(computeExportScale(438, 372, desktop)).toBe(PREFERRED_PIXEL_RATIO);
  });

  it('never lets either side exceed the limit', () => {
    // A 500-person tree is roughly 50,000 board pixels wide.
    const ratio = computeExportScale(49726, 1842, desktop);
    expect(ratio).toBeLessThan(1);
    expect(Math.ceil(49726 * ratio)).toBeLessThanOrEqual(desktop.maxSide);
  });

  it('never lets the total area exceed the limit', () => {
    const ratio = computeExportScale(10000, 10000, ios);
    expect(Math.ceil(10000 * ratio) * Math.ceil(10000 * ratio)).toBeLessThanOrEqual(ios.maxArea);
  });

  it('is stricter under the iOS limits than the desktop ones', () => {
    expect(computeExportScale(20000, 3000, ios)).toBeLessThan(computeExportScale(20000, 3000, desktop));
  });

  it('depends only on board size, so the same board exports the same at any zoom', () => {
    // The function takes no view/zoom input at all; the same board size is
    // always the same answer.
    expect(computeExportScale(5000, 800, desktop)).toBe(computeExportScale(5000, 800, desktop));
  });

  it('falls back to the preferred ratio for an empty or invalid size', () => {
    expect(computeExportScale(0, 100, desktop)).toBe(PREFERRED_PIXEL_RATIO);
    expect(computeExportScale(NaN, 100, desktop)).toBe(PREFERRED_PIXEL_RATIO);
  });
});
