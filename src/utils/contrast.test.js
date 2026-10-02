// @vitest-environment jsdom
// jsdom only for the error screen check at the bottom, which renders it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import tailwind from '../../tailwind.config.js';
import { EXPORT_THEMES, LINE_STYLES } from './constants';
import ErrorBoundary from '../components/ErrorBoundary';

// '#0B6E7C', '#fff' or 'rgb(11, 110, 124)' -> [r, g, b]
function channels(colour) {
  const rgb = colour.match(/rgba?\(([^)]+)\)/);
  if (rgb) return rgb[1].split(',').slice(0, 3).map((v) => Number(v.trim()));
  let n = colour.replace('#', '');
  if (n.length === 3) n = [...n].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(colour) {
  const [r, g, b] = channels(colour)
    .map((v) => v / 255)
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

// The error screen is styled inline (it has to render even if the
// stylesheet is what broke), so the token checks above can't see it. This
// renders it and checks every piece of text against the background it
// actually sits on (F8).
describe('error screen contrast (F8)', () => {
  afterEach(cleanup);

  // An element's own inline colour, or the nearest ancestor's.
  const inherited = (el, prop) => {
    for (let node = el; node; node = node.parentElement) {
      const value = node.style?.[prop];
      if (value && value !== 'transparent') return value;
    }
    return null;
  };

  it('every text colour on it clears 4.5:1 against what it sits on', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.clear();
    function Boom() {
      throw new Error('broken');
    }
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    // The red note only appears after an action; with nothing saved, asking
    // for a backup shows it.
    fireEvent.click(screen.getByRole('button', { name: /Download a backup/ }));
    expect(screen.getByText(/Nothing is saved/)).toBeTruthy();

    const texts = [...document.querySelectorAll('h1, p, button')].filter((el) => el.textContent.trim());
    expect(texts.length).toBeGreaterThanOrEqual(6);
    for (const el of texts) {
      const fg = inherited(el, 'color');
      const bg = inherited(el, 'backgroundColor');
      expect([el.textContent.trim().slice(0, 30), Boolean(fg && bg)]).toEqual([expect.any(String), true]);
      expect(contrast(fg, bg), el.textContent.trim().slice(0, 40)).toBeGreaterThanOrEqual(4.5);
    }
    vi.restoreAllMocks();
  });
});
