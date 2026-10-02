import { describe, expect, it } from 'vitest';
import { clampScale, fitScale, MAX_SCALE, MIN_SCALE, minScaleFor, wheelAction } from './viewport';

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

describe('wheel and trackpad (M6)', () => {
  const wheel = (over) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, wheelDeltaY: undefined, ...over });

  it('a horizontal swipe pans sideways and never zooms', () => {
    expect(wheelAction(wheel({ deltaX: 30 }))).toEqual({ type: 'pan', dx: -30, dy: 0 });
  });

  it('a two-finger trackpad scroll pans', () => {
    expect(wheelAction(wheel({ deltaX: 3, deltaY: 12, wheelDeltaY: -36 }))).toEqual({ type: 'pan', dx: -3, dy: -12 });
    expect(wheelAction(wheel({ deltaY: 40, wheelDeltaY: -120 })).type).toBe('pan'); // small step: not a mouse notch
  });

  it('a pinch zooms gently, in proportion to the movement', () => {
    const inward = wheelAction(wheel({ deltaY: -4, ctrlKey: true }));
    expect(inward.type).toBe('zoom');
    expect(inward.factor).toBeGreaterThan(1);
    expect(inward.factor).toBeLessThan(1.05);
    expect(wheelAction(wheel({ deltaY: 4, ctrlKey: true })).factor).toBeCloseTo(1 / inward.factor, 10);
  });

  it('a mouse wheel notch zooms about 10%, including on scaled displays and in Firefox', () => {
    for (const evt of [
      wheel({ deltaY: 100, wheelDeltaY: -120 }), // Chrome / Edge
      wheel({ deltaY: 125, wheelDeltaY: -120 }), // 125% display scaling
      wheel({ deltaY: 3, deltaMode: 1 }), // Firefox, in lines
    ]) {
      const action = wheelAction(evt);
      expect(action.type).toBe('zoom');
      expect(action.factor).toBeGreaterThan(0.85);
      expect(action.factor).toBeLessThan(0.95);
    }
  });

  it('ctrl + mouse wheel zooms at the mouse rate, not the pinch rate', () => {
    const action = wheelAction(wheel({ deltaY: 100, wheelDeltaY: -120, ctrlKey: true }));
    expect(action.factor).toBeGreaterThan(0.85);
  });

  it('ignores an event that moves nothing', () => {
    expect(wheelAction(wheel({}))).toBe(null);
  });
});
