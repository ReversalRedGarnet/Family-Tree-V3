import { describe, it, expect } from 'vitest';
import { validateRelationship, findDuplicatePerson, describeDeleteImpact } from './validation';

function person(id, overrides = {}) {
  return { id, firstName: 'First', lastName: `${id}`, ...overrides };
}

describe('validateRelationship', () => {
  const people = { a: person('a'), b: person('b'), c: person('c') };

  it('rejects a missing id on either side', () => {
    expect(validateRelationship('partner', null, 'b', people, {}).ok).toBe(false);
    expect(validateRelationship('partner', 'a', null, people, {}).ok).toBe(false);
  });

  it('rejects linking someone to themselves', () => {
    const result = validateRelationship('partner', 'a', 'a', people, {});
    expect(result.ok).toBe(false);
  });

  it('rejects a person no longer on the board', () => {
    const result = validateRelationship('partner', 'a', 'ghost', people, {});
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate parent link', () => {
    const relationships = { r1: { kind: 'parent', a: 'a', b: 'b' } };
    const result = validateRelationship('parent', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('allows a fresh partnership after a divorce (a remarriage is not a duplicate)', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'b', status: 'divorced' } };
    const result = validateRelationship('partner', 'a', 'b', people, relationships);
    expect(result.ok).toBe(true);
  });

  it('rejects a second unconcluded partnership between the same two people', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'b', status: 'separated' } };
    const result = validateRelationship('partner', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('rejects making a cyclical parent link', () => {
    const relationships = { r1: { kind: 'parent', a: 'a', b: 'b' } };
    // b is already a's child; making a b's child too would make a its own
    // ancestor.
    const result = validateRelationship('parent', 'b', 'a', people, relationships);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own ancestor/);
  });

  it('rejects a partnership between two people already parent and child', () => {
    const relationships = { r1: { kind: 'parent', a: 'a', b: 'b' } };
    const result = validateRelationship('partner', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('rejects a partnership between two people already recorded as siblings', () => {
    const relationships = { r1: { kind: 'sibling', a: 'a', b: 'b' } };
    const result = validateRelationship('partner', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('rejects a partnership when one side is already partnered with someone else', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'c', status: 'together' } };
    const result = validateRelationship('partner', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already partnered/);
  });

  it('rejects sibling links between two people already parent and child', () => {
    const relationships = { r1: { kind: 'parent', a: 'a', b: 'b' } };
    const result = validateRelationship('sibling', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('rejects sibling links between two people already partners', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'b' } };
    const result = validateRelationship('sibling', 'a', 'b', people, relationships);
    expect(result.ok).toBe(false);
  });

  it('allows an unrelated sibling link with nothing on record', () => {
    const result = validateRelationship('sibling', 'a', 'c', people, {});
    expect(result.ok).toBe(true);
  });

  it('allows a second child with no partner recorded (a single parent is fine)', () => {
    const result = validateRelationship('parent', 'a', 'c', people, {});
    expect(result.ok).toBe(true);
  });
});

describe('findDuplicatePerson', () => {
  const people = {
    p1: { id: 'p1', firstName: 'Jane', lastName: 'Doe', birthYear: '1980', gender: 'female' },
  };

  it('finds an exact match on name, birth year and gender', () => {
    const match = findDuplicatePerson(
      { firstName: 'Jane', lastName: 'Doe', birthYear: '1980', gender: 'female' },
      people
    );
    expect(match).toBe(people.p1);
  });

  it('is case- and whitespace-insensitive', () => {
    const match = findDuplicatePerson(
      { firstName: '  jane ', lastName: 'DOE', birthYear: '1980', gender: 'Female' },
      people
    );
    expect(match).toBe(people.p1);
  });

  it('does not flag a same-name person with a different birth year (grandparent/grandchild)', () => {
    const match = findDuplicatePerson(
      { firstName: 'Jane', lastName: 'Doe', birthYear: '2010', gender: 'female' },
      people
    );
    expect(match).toBeNull();
  });

  it('never matches when there is no name to go on', () => {
    const match = findDuplicatePerson({ firstName: '', lastName: '', birthYear: '1980' }, people);
    expect(match).toBeNull();
  });

  it('excludes the person being edited from matching themselves', () => {
    const match = findDuplicatePerson(
      { firstName: 'Jane', lastName: 'Doe', birthYear: '1980', gender: 'female' },
      people,
      'p1'
    );
    expect(match).toBeNull();
  });
});

describe('describeDeleteImpact', () => {
  it('counts every link touching the person, and children separately', () => {
    const relationships = {
      r1: { kind: 'parent', a: 'a', b: 'child1' },
      r2: { kind: 'parent', a: 'a', b: 'child2' },
      r3: { kind: 'partner', a: 'a', b: 'partner1' },
      r4: { kind: 'parent', a: 'someoneElse', b: 'other' }, // unrelated to 'a'
    };
    const result = describeDeleteImpact('a', {}, relationships);
    expect(result.linkCount).toBe(3);
    expect(result.childCount).toBe(2);
  });
});
