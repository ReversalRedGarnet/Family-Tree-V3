import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLongPress, LONG_PRESS_MS, LONG_PRESS_SLOP } from './longPress';

describe('long-press (M14)', () => {
  let onFire;
  let press;

  beforeEach(() => {
    vi.useFakeTimers();
    onFire = vi.fn();
    press = createLongPress({ onFire });
  });
  afterEach(() => vi.useRealTimers());

  it('fires once the finger has been held still long enough, with where it went down', () => {
    press.start(100, 200, { personId: 'ann' });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onFire).not.toHaveBeenCalled();
    expect(press.pending).toBe(true);

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledWith({ x: 100, y: 200, detail: { personId: 'ann' } });
    expect(press.fired).toBe(true);
    expect(press.pending).toBe(false);
  });

  it('a small wobble still counts as holding still', () => {
    press.start(100, 200, {});
    press.move(100 + LONG_PRESS_SLOP, 200);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('moving further (a pan or drag) cancels it', () => {
    press.start(100, 200, {});
    press.move(100, 200 + LONG_PRESS_SLOP + 1);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onFire).not.toHaveBeenCalled();
    expect(press.fired).toBe(false);
  });

  it('lifting early or a second finger (cancel) means it never fires', () => {
    press.start(100, 200, {});
    vi.advanceTimersByTime(LONG_PRESS_MS / 2);
    press.cancel();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('stays "fired" until the next touch, so the tap ending the gesture can be ignored', () => {
    press.start(0, 0, {});
    vi.advanceTimersByTime(LONG_PRESS_MS);
    press.cancel(); // finger lifted
    expect(press.fired).toBe(true);
    press.start(0, 0, {});
    expect(press.fired).toBe(false);
  });

  it("claim(): Android's own long-press menu came first, so the timer never opens a second one", () => {
    press.start(0, 0, {});
    vi.advanceTimersByTime(LONG_PRESS_MS - 50);
    press.claim();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onFire).not.toHaveBeenCalled();
    expect(press.fired).toBe(true);
  });
});
