import { describe, expect, it } from 'vitest';
import tailwind from '../../tailwind.config.js';
import { EXPORT_THEMES, LINE_STYLES } from './constants';

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const c = tailwind.theme.extend.colors;
const WHITE = '#FFFFFF';
const board = EXPORT_THEMES[0];

describe('contrast (M4)', () => {
  it('body and secondary text clear 4.5:1 on every surface they sit on', () => {
    for (const surface of [WHITE, c.paper, c.cyan.wash]) {
      expect(contrast(c.ink, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.mist, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.cyan.deep, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('white text on the primary-button colour clears 4.5:1', () => {
    expect(contrast(WHITE, c.cyan.deep)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, c.rose)).toBeGreaterThanOrEqual(4.5);
  });

  it('every relationship line clears 3:1 against the board', () => {
    for (const [key, style] of Object.entries(LINE_STYLES)) {
      expect(contrast(style.color, board.background), key).toBeGreaterThanOrEqual(3);
    }
  });

  // Every export template, the plain board and parchment (F6) alike.
  for (const theme of EXPORT_THEMES) {
    it(`${theme.label}: card text clears 4.5:1 on its fill, and the memorial band carries white text`, () => {
      const { living, gone } = theme.card;
      expect(contrast(living.title, living.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(living.sub, living.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(gone.title, gone.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(gone.sub, gone.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(WHITE, gone.band)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.memoColor, theme.background)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
