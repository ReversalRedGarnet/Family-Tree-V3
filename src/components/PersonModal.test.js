// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PersonModal from './PersonModal';
import RelationshipModal from './RelationshipModal';

afterEach(cleanup);

const ann = { id: 'a', firstName: 'Ann', lastName: 'Lee', gender: 'female', living: true, occupation: '' };
const ben = { id: 'b', firstName: 'Ben', lastName: 'Lee', gender: 'male', living: true };
const marriage = { id: 'r1', kind: 'partner', a: 'a', b: 'b', type: 'marriage', status: 'together' };

function Board({ person = ann, linkOpen = false, onCancelPerson, onCancelLink, onEditRelationship }) {
  const people = { a: person, b: ben };
  const relationships = { r1: marriage };
  return h(
    'div',
    null,
    h(PersonModal, {
      open: true,
      mode: 'edit',
      initialPerson: person,
      people,
      relationships,
      onSave: () => {},
      onCancel: onCancelPerson,
      onEditRelationship,
      onDeleteRelationship: () => {},
    }),
    h(RelationshipModal, {
      open: linkOpen,
      personA: 'a',
      personB: 'b',
      people,
      relationships,
      presetKind: 'partner',
      editing: linkOpen ? marriage : null,
      onConfirm: () => {},
      onCancel: onCancelLink,
    })
  );
}

const occupation = () => screen.getByPlaceholderText("Baker, teacher, ship's engineer…");

describe('editing a link from the person form (F1, F2)', () => {
  it('each link in the form has an Edit button', () => {
    const onEditRelationship = vi.fn();
    render(h(Board, { onEditRelationship }));
    fireEvent.click(screen.getByRole('button', { name: /^Edit link: Married · Ben Lee/ }));
    expect(onEditRelationship).toHaveBeenCalledWith('r1');
  });

  it('Escape in the link dialog closes it and keeps unsaved person edits', () => {
    const onCancelPerson = vi.fn();
    const onCancelLink = vi.fn();
    const { rerender } = render(h(Board, { onCancelPerson, onCancelLink, onEditRelationship: () => {} }));
    fireEvent.change(occupation(), { target: { value: 'Pilot' } });

    rerender(h(Board, { linkOpen: true, onCancelPerson, onCancelLink, onEditRelationship: () => {} }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancelLink).toHaveBeenCalledTimes(1);
    expect(onCancelPerson).not.toHaveBeenCalled();

    // The parent closes the link dialog in response; the form is untouched.
    rerender(h(Board, { onCancelPerson, onCancelLink, onEditRelationship: () => {} }));
    expect(occupation().value).toBe('Pilot');
  });

  it('a change to the person made from the link dialog merges into the open form', () => {
    const { rerender } = render(h(Board, { onEditRelationship: () => {} }));
    fireEvent.change(occupation(), { target: { value: 'Pilot' } });

    // Saving the link as "widowed" marked Ann as no longer living.
    rerender(h(Board, { person: { ...ann, living: false }, onEditRelationship: () => {} }));

    expect(occupation().value).toBe('Pilot');
    expect(screen.getByRole('radio', { name: 'Deceased' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opening the form for a different person starts fresh', () => {
    const { rerender } = render(h(Board, { onEditRelationship: () => {} }));
    fireEvent.change(occupation(), { target: { value: 'Pilot' } });

    rerender(h(Board, { person: { ...ann, id: 'z', firstName: 'Zoe' }, onEditRelationship: () => {} }));

    expect(occupation().value).toBe('');
    expect(screen.getByPlaceholderText('Amara').value).toBe('Zoe');
  });
});
