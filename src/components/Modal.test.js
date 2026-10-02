// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Modal, { openModalCount } from './Modal';

afterEach(cleanup);

const escape = () => fireEvent.keyDown(window, { key: 'Escape' });
const overlayOf = (title) => screen.getByRole('dialog', { name: title, hidden: true }).parentElement;

function Stacked({ topOpen = true, onCloseForm, onCloseQuestion }) {
  return h(
    'div',
    null,
    h(Modal, { open: true, title: 'Edit person', onClose: onCloseForm }, h('input', { 'aria-label': 'First name' })),
    h(Modal, { open: topOpen, title: 'Edit link', onClose: onCloseQuestion }, h('button', null, 'Save'))
  );
}

describe('Modal stacking (M2, F1)', () => {
  it('Escape closes only the dialog on top, never the form underneath', () => {
    const onCloseForm = vi.fn();
    const onCloseQuestion = vi.fn();
    render(h(Stacked, { onCloseForm, onCloseQuestion }));

    escape();

    expect(onCloseQuestion).toHaveBeenCalledTimes(1);
    expect(onCloseForm).not.toHaveBeenCalled();
  });

  it('makes the dialog underneath inert until the top one closes', () => {
    const { rerender } = render(h(Stacked, {}));
    expect(overlayOf('Edit person').hasAttribute('inert')).toBe(true);
    expect(overlayOf('Edit link').hasAttribute('inert')).toBe(false);

    rerender(h(Stacked, { topOpen: false }));

    expect(overlayOf('Edit person').hasAttribute('inert')).toBe(false);
    expect(openModalCount()).toBe(1);
  });

  it('once the top dialog closes, Escape reaches the one underneath', () => {
    const onCloseForm = vi.fn();
    const { rerender } = render(h(Stacked, { onCloseForm }));
    rerender(h(Stacked, { onCloseForm, topOpen: false }));

    escape();

    expect(onCloseForm).toHaveBeenCalledTimes(1);
  });

  it('puts the page scroll back only when the last dialog closes', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(h(Stacked, {}));
    expect(document.body.style.overflow).toBe('hidden');

    rerender(h(Stacked, { topOpen: false }));
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(openModalCount()).toBe(0);
  });
});

describe('Modal focus (M1)', () => {
  it('a re-render with a new onClose does not move focus', () => {
    const view = (onClose) =>
      h(
        Modal,
        { open: true, title: 'Link', onClose },
        h('button', null, 'First'),
        h('input', { 'aria-label': 'Year started' })
      );
    const { rerender } = render(view(() => {}));
    const field = screen.getByLabelText('Year started');
    field.focus();

    rerender(view(() => {}));

    expect(document.activeElement).toBe(field);
  });

  it('gives focus back to the opener on close, even when a field inside autofocused', () => {
    const view = (open) =>
      h(
        'div',
        null,
        h('button', null, 'Opener'),
        h(Modal, { open, title: 'Add', onClose: () => {} }, h('input', { autoFocus: true, 'aria-label': 'Name' }))
      );
    const { rerender } = render(view(false));
    screen.getByText('Opener').focus();

    rerender(view(true));
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    rerender(view(false));
    expect(document.activeElement).toBe(screen.getByText('Opener'));
  });

  it('Escape calls the latest onClose, not the first one', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const view = (onClose) => h(Modal, { open: true, title: 'Link', onClose }, h('button', null, 'x'));
    const { rerender } = render(view(first));
    rerender(view(latest));

    escape();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
