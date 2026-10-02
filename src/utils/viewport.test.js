import { describe, expect, it } from 'vitest';
import { clampScale, fitScale, MAX_SCALE, MIN_SCALE, minScaleFor } from './viewport';

const screen = { width: 1400, height: 800 };

describe('zoom limits (L9)', () => {
  it('a small tree keeps the usual 30% floor', () => {
    expect(minScaleFor({ minX: 0, minY: 0, maxX: 2000, maxY: 1000 }, screen)).toBe(MIN_SCALE);
  });

  it('a very wide tree can zoom out far enough for Fit to show all of it', () => {
    const bounds = { minX: 0, minY: 0, maxX: 50000, maxY: 2000 };
    const min = minScaleFor(bounds, screen);
    expect(min).toBeCloseTo(1400 / 50000, 5);
    expect(clampScale(fitScale(bounds, screen), min) * 50000).toBeLessThanOrEqual(1400);
  });

  it('clamps to the allowed range', () => {
    expect(clampScale(10, 0.3)).toBe(MAX_SCALE);
    expect(clampScale(0.01, 0.3)).toBe(0.3);
  });

  it('falls back to the usual floor before the board has a size', () => {
    expect(minScaleFor({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 0, height: 0 })).toBe(MIN_SCALE);
  });
});
