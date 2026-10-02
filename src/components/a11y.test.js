// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import PersonModal from './PersonModal';
import RelationshipModal from './RelationshipModal';
import ToastStack from './ToastStack';

afterEach(cleanup);

const people = {
  a: { id: 'a', firstName: 'Ann', lastName: 'Lee', gender: 'female', living: true },
  b: { id: 'b', firstName: 'Ben', lastName: 'Lee', gender: 'male', living: true },
};

const linkModal = (presetKind) =>
  h(RelationshipModal, {
    open: true,
    personA: 'a',
    personB: 'b',
    people,
    relationships: {},
    presetKind,
    onConfirm: () => {},
    onCancel: () => {},
  });

describe('fields with an (i) hint are labelled (M3)', () => {
  it('Additional names labels its input, and the hint describes it', () => {
    render(h(PersonModal, { open: true, mode: 'add', people, onSave: () => {}, onCancel: () => {} }));
    const input = screen.getByLabelText('Additional names');
    expect(input.tagName).toBe('INPUT');
    expect(input.labels[0].textContent).toBe('Additional names');
    const hint = document.getElementById(input.getAttribute('aria-describedby'));
    expect(hint.textContent).toMatch(/maiden name/);
  });

  it('partner Status labels its select', () => {
    render(linkModal('partner'));
    expect(screen.getByLabelText('Status').tagName).toBe('SELECT');
  });

  it('Kind of parent labels its select', () => {
    render(linkModal('parent'));
    expect(screen.getByLabelText('Kind of parent').tagName).toBe('SELECT');
  });

  it('Kind of siblings names its choice group', () => {
    render(linkModal('sibling'));
    expect(screen.getByRole('group', { name: 'Kind of siblings' })).toBeTruthy();
  });
});

describe('toasts are announced (L15)', () => {
  it('both live regions exist before any toast arrives', () => {
    render(h(ToastStack, { toasts: [], onDismiss: () => {} }));
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('errors go in the assertive region, everything else in the polite one', () => {
    render(
      h(ToastStack, {
        toasts: [
          { id: 1, type: 'error', message: 'Export failed.' },
          { id: 2, type: 'success', message: 'Saved.' },
        ],
        onDismiss: () => {},
      })
    );
    expect(screen.getByRole('alert').textContent).toContain('Export failed.');
    expect(screen.getByRole('alert').textContent).not.toContain('Saved.');
    expect(screen.getByRole('status').textContent).toContain('Saved.');
  });
});
