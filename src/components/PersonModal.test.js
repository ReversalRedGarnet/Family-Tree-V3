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

  it('name fields cap their length (M13)', () => {
    render(h(Board, { onEditRelationship: () => {} }));
    expect(screen.getByPlaceholderText('Amara').maxLength).toBe(80);
    expect(screen.getByPlaceholderText('Okafor').maxLength).toBe(80);
    expect(screen.getByLabelText('Additional names').maxLength).toBe(80);
  });

  it('year fields take digits only, and say so in a hint tied to the field (L4)', () => {
    render(h(PersonModal, { open: true, mode: 'add', people: {}, onSave: () => {}, onCancel: () => {} }));
    const birth = screen.getByPlaceholderText('1953');
    fireEvent.change(birth, { target: { value: 'c. 1890s' } });
    expect(birth.value).toBe('1890');

    const hint = document.getElementById(birth.getAttribute('aria-describedby'));
    expect(hint.textContent).toMatch(/Digits only/);
    expect(hint.textContent).toMatch(/Notes/);

    fireEvent.click(screen.getByRole('radio', { name: 'Deceased' }));
    const death = screen.getByPlaceholderText('2011');
    expect(document.getElementById(death.getAttribute('aria-describedby')).textContent).toMatch(/Digits only/);
  });

  it('partnership years carry the same digits-only hint (L4)', () => {
    render(h(Board, { linkOpen: true, onEditRelationship: () => {} }));
    const started = screen.getByPlaceholderText('1998');
    fireEvent.change(started, { target: { value: 'about 2001' } });
    expect(started.value).toBe('2001');
    expect(document.getElementById(started.getAttribute('aria-describedby')).textContent).toMatch(/digits only/);
  });

  it('a hidden year of death is dropped when saving someone marked alive (L5)', () => {
    const onSave = vi.fn();
    render(h(PersonModal, { open: true, mode: 'add', people: {}, onSave, onCancel: () => {} }));
    fireEvent.change(screen.getByPlaceholderText('Amara'), { target: { value: 'Dot' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Deceased' }));
    fireEvent.change(screen.getByPlaceholderText('2011'), { target: { value: '1999' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Alive' }));
    expect(screen.queryByPlaceholderText('2011')).toBe(null);

    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ living: true, deathYear: '' }));
  });

  it('a deceased person keeps their year of death on save (L5)', () => {
    const onSave = vi.fn();
    render(h(PersonModal, { open: true, mode: 'add', people: {}, onSave, onCancel: () => {} }));
    fireEvent.click(screen.getByRole('radio', { name: 'Deceased' }));
    fireEvent.change(screen.getByPlaceholderText('2011'), { target: { value: '1999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ living: false, deathYear: '1999' }));
  });

  it('opening the form for a different person starts fresh', () => {
    const { rerender } = render(h(Board, { onEditRelationship: () => {} }));
    fireEvent.change(occupation(), { target: { value: 'Pilot' } });

    rerender(h(Board, { person: { ...ann, id: 'z', firstName: 'Zoe' }, onEditRelationship: () => {} }));

    expect(occupation().value).toBe('');
    expect(screen.getByPlaceholderText('Amara').value).toBe('Zoe');
  });
});
