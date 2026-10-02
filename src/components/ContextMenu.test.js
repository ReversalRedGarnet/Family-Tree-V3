// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ContextMenu from './ContextMenu';

afterEach(cleanup);

// A trigger button that opens the menu, the way the people list's ⋯ does.
function Harness({ items, onWindowKey }) {
  const [open, setOpen] = useState(false);
  return h(
    'div',
    { onKeyDown: onWindowKey },
    h('button', { onClick: () => setOpen(true) }, 'Open menu'),
    h(ContextMenu, { open, x: 10, y: 10, items, onClose: () => setOpen(false) })
  );
}

const makeItems = () => ({
  edit: vi.fn(),
  link: vi.fn(),
  del: vi.fn(),
});

function setup() {
  const spies = makeItems();
  const items = [
    { label: 'Edit…', onSelect: spies.edit },
    { label: 'Link to another person…', disabled: true, onSelect: spies.link },
    { divider: true },
    { label: 'Add a parent', onSelect: vi.fn() },
    { label: 'Delete', danger: true, onSelect: spies.del },
  ];
  render(h(Harness, { items }));
  const trigger = screen.getByText('Open menu');
  trigger.focus();
  openWithKeyboard(trigger);
  return { spies, trigger };
}

// The trigger "pressed" with Enter, so the menu knows a keyboard opened it.
function openWithKeyboard(trigger) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  act(() => trigger.click());
}

const focused = () => document.activeElement?.textContent;
const press = (key) => fireEvent.keyDown(document.activeElement, { key });

describe('context menu keyboard (M5)', () => {
  it('moves focus to the first item when it opens', () => {
    setup();
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(focused()).toBe('Edit…');
  });

  it('opened by mouse or touch, it focuses the menu itself, so no item lights up', () => {
    const items = [
      { label: 'Edit…', onSelect: vi.fn() },
      { label: 'Delete', onSelect: vi.fn() },
    ];
    render(h(Harness, { items }));
    const trigger = screen.getByText('Open menu');
    fireEvent.pointerDown(trigger);
    act(() => trigger.click());
    expect(document.activeElement).toBe(screen.getByRole('menu'));
    press('ArrowDown');
    expect(focused()).toBe('Edit…');
    act(() => screen.getByRole('menu').focus());
    press('ArrowUp');
    expect(focused()).toBe('Delete');
  });

  it('arrow keys move between items, skipping disabled ones, and wrap', () => {
    setup();
    press('ArrowDown');
    expect(focused()).toBe('Add a parent');
    press('ArrowDown');
    expect(focused()).toBe('Delete');
    press('ArrowDown');
    expect(focused()).toBe('Edit…');
    press('ArrowUp');
    expect(focused()).toBe('Delete');
    press('Home');
    expect(focused()).toBe('Edit…');
    press('End');
    expect(focused()).toBe('Delete');
  });

  it('Enter and Space pick the focused item, then focus returns to the opener', () => {
    const { spies, trigger } = setup();
    press('Enter');
    expect(spies.edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    press('End');
    press(' ');
    expect(spies.del).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('focus is back on the opener before the item runs, so a dialog it opens returns there', () => {
    let focusDuringSelect = null;
    const items = [{ label: 'Edit…', onSelect: () => (focusDuringSelect = document.activeElement) }];
    render(h(Harness, { items }));
    const trigger = screen.getByText('Open menu');
    trigger.focus();
    openWithKeyboard(trigger);
    press('Enter');
    expect(focusDuringSelect).toBe(trigger);
  });

  it('Escape closes it and returns focus, without reaching the app behind it', () => {
    const onWindowKey = vi.fn();
    const items = [{ label: 'Edit…', onSelect: vi.fn() }];
    const windowKey = vi.fn();
    window.addEventListener('keydown', windowKey);
    try {
      render(h(Harness, { items, onWindowKey }));
      const trigger = screen.getByText('Open menu');
      trigger.focus();
      openWithKeyboard(trigger);
      onWindowKey.mockClear();
      windowKey.mockClear();
      press('Escape');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(onWindowKey).not.toHaveBeenCalled();
      expect(windowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKey);
    }
  });

  it('Tab closes it and returns focus too', () => {
    const { trigger } = setup();
    press('Tab');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('a click elsewhere closes it without pulling focus back', () => {
    const { trigger } = setup();
    const other = document.createElement('input');
    document.body.appendChild(other);
    try {
      fireEvent.mouseDown(other);
      other.focus();
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(other);
      expect(document.activeElement).not.toBe(trigger);
    } finally {
      other.remove();
    }
  });
});
