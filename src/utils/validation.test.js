import { describe, it, expect } from 'vitest';
import { validateRelationship, findDuplicatePerson, describeDeleteImpact, collectTreeWarnings } from './validation';

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

  it('a separated partnership still blocks a new current one, for either side (F3)', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'c', status: 'separated' } };
    for (const [x, y] of [['a', 'b'], ['b', 'a']]) {
      const result = validateRelationship('partner', x, y, people, relationships, { status: 'together' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/already partnered/);
    }
    expect(validateRelationship('partner', 'c', 'b', people, relationships).ok).toBe(false);
  });

  it('a separated partnership does not block recording an ended one (F3)', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'c', status: 'separated' } };
    expect(validateRelationship('partner', 'a', 'b', people, relationships, { status: 'divorced' }).ok).toBe(true);
  });

  it('once the separation becomes a divorce, a new current partnership is fine (F3)', () => {
    const relationships = { r1: { kind: 'partner', a: 'a', b: 'c', status: 'divorced' } };
    expect(validateRelationship('partner', 'a', 'b', people, relationships, { status: 'together' }).ok).toBe(true);
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

  it('for several people: links counted once, and only children who stay behind (M7)', () => {
    const relationships = {
      r1: { kind: 'partner', a: 'a', b: 'b' },
      r2: { kind: 'parent', a: 'a', b: 'kid' },
      r3: { kind: 'parent', a: 'b', b: 'kid' },
      r4: { kind: 'parent', a: 'a', b: 'b2' }, // b2 is deleted too, so doesn't "stay"
      r5: { kind: 'sibling', a: 'kid', b: 'other' }, // untouched
    };
    const result = describeDeleteImpact(['a', 'b', 'b2'], {}, relationships);
    expect(result.linkCount).toBe(4);
    expect(result.childCount).toBe(1);
  });
});

describe('validateRelationship: generation consistency', () => {
  const people = {
    g: person('g'), c: person('c'), k: person('k'), a: person('a'), b: person('b'), d: person('d'), x: person('x'),
  };

  it('rejects making one partner the parent of the other', () => {
    const rels = { r1: { kind: 'partner', a: 'a', b: 'b' } };
    const result = validateRelationship('parent', 'a', 'b', people, rels);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/same generation/);
  });

  it('rejects making one sibling the parent of the other', () => {
    const rels = { r1: { kind: 'sibling', a: 'a', b: 'b' } };
    expect(validateRelationship('parent', 'a', 'b', people, rels).ok).toBe(false);
  });

  it('rejects a grandparent and grandchild becoming partners or siblings', () => {
    const rels = { r1: { kind: 'parent', a: 'g', b: 'c' }, r2: { kind: 'parent', a: 'c', b: 'k' } };
    const partner = validateRelationship('partner', 'g', 'k', people, rels);
    expect(partner.ok).toBe(false);
    expect(partner.error).toMatch(/2 generations below/);
    expect(validateRelationship('sibling', 'g', 'k', people, rels).ok).toBe(false);
  });

  it('rejects linking someone as a sibling of their uncle through an existing sibling', () => {
    // b and c are siblings, d is c's child, a is d's sibling: a and b are a
    // generation apart, so a-b can't be siblings.
    const rels = {
      r1: { kind: 'sibling', a: 'b', b: 'c' },
      r2: { kind: 'parent', a: 'c', b: 'd' },
      r3: { kind: 'sibling', a: 'a', b: 'd' },
    };
    const result = validateRelationship('sibling', 'a', 'b', people, rels);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1 generation above/);
  });

  it('rejects making a nephew the parent of his uncle', () => {
    const rels = { r1: { kind: 'sibling', a: 'b', b: 'c' }, r2: { kind: 'parent', a: 'c', b: 'd' } };
    expect(validateRelationship('parent', 'd', 'b', people, rels).ok).toBe(false);
  });

  it('still allows links that agree with existing generations', () => {
    // An aunt adopting her niece: already exactly one generation apart.
    const auntNiece = { r1: { kind: 'sibling', a: 'a', b: 'c' }, r2: { kind: 'parent', a: 'c', b: 'd' } };
    expect(validateRelationship('parent', 'a', 'd', people, auntNiece).ok).toBe(true);
    // Cousins marrying: same generation.
    const cousins = {
      r1: { kind: 'sibling', a: 'g', b: 'x' },
      r2: { kind: 'parent', a: 'g', b: 'a' },
      r3: { kind: 'parent', a: 'x', b: 'b' },
    };
    expect(validateRelationship('partner', 'a', 'b', people, cousins).ok).toBe(true);
    // Two people with nothing connecting them yet.
    expect(validateRelationship('parent', 'a', 'b', people, {}).ok).toBe(true);
  });

  it('places no generation constraint on an "other" link', () => {
    const rels = { r1: { kind: 'parent', a: 'g', b: 'c' }, r2: { kind: 'parent', a: 'c', b: 'k' } };
    expect(validateRelationship('other', 'g', 'k', people, rels).ok).toBe(true);
  });
});

describe('collectTreeWarnings', () => {
  it('judges age gaps against birth parents only', () => {
    const people = {
      child: person('child', { birthYear: '2000' }),
      mum: person('mum', { firstName: 'Mum', birthYear: '1975' }),
      step: person('step', { firstName: 'Step', birthYear: '1995' }),
    };
    const rels = {
      r1: { kind: 'parent', a: 'mum', b: 'child', type: 'birth' },
      r2: { kind: 'parent', a: 'step', b: 'child', type: 'step' },
    };
    expect(collectTreeWarnings(people, rels)).toEqual([]);
  });

  it('checks every birth parent, not just the first two', () => {
    const people = {
      child: person('child', { birthYear: '2000' }),
      p1: person('p1', { firstName: 'One', birthYear: '1970' }),
      p2: person('p2', { firstName: 'Two', birthYear: '1972' }),
      p3: person('p3', { firstName: 'Three', birthYear: '1995' }),
    };
    const rels = {
      r1: { kind: 'parent', a: 'p1', b: 'child' },
      r2: { kind: 'parent', a: 'p2', b: 'child' },
      r3: { kind: 'parent', a: 'p3', b: 'child' },
    };
    expect(collectTreeWarnings(people, rels).map((w) => w.message)).toEqual(['Three would only have been 5 — worth a check.']);
  });
});

describe('validateRelationship: ended partnerships', () => {
  const people = { a: person('a'), x: person('x'), y: person('y') };
  const current = { r1: { kind: 'partner', a: 'a', b: 'y', status: 'together' } };

  it('lets an ended partnership be recorded while a current one exists', () => {
    expect(validateRelationship('partner', 'a', 'x', people, current, { status: 'divorced' }).ok).toBe(true);
    expect(validateRelationship('partner', 'x', 'a', people, current, { status: 'widowed' }).ok).toBe(true);
  });

  it('lets an earlier, ended marriage to the same person sit beside the current one', () => {
    expect(validateRelationship('partner', 'a', 'y', people, current, { status: 'divorced' }).ok).toBe(true);
  });

  it('still refuses a second current partnership, and says how to end the first', () => {
    for (const status of [undefined, 'together', 'separated']) {
      const result = validateRelationship('partner', 'a', 'x', people, current, { status });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Mark that link as divorced or widowed/);
    }
  });

  it('still refuses a second current partnership between the same two people', () => {
    expect(validateRelationship('partner', 'a', 'y', people, current, { status: 'together' }).ok).toBe(false);
  });
});

describe('collectTreeWarnings: partnership years', () => {
  it('flags a partnership that ends before it starts', () => {
    const people = { a: person('a', { firstName: 'Ann', lastName: '' }), b: person('b', { firstName: 'Bob', lastName: '' }) };
    const rels = { r1: { kind: 'partner', a: 'a', b: 'b', startDate: '2015', endDate: '2010' } };
    expect(collectTreeWarnings(people, rels).map((w) => w.message)).toEqual([
      'Their partnership with Bob ends (2010) before it starts (2015).',
    ]);
  });

  it('says nothing when either year is missing or they are in order', () => {
    const people = { a: person('a'), b: person('b') };
    const rels = {
      r1: { kind: 'partner', a: 'a', b: 'b', startDate: '2010', endDate: '2015' },
      r2: { kind: 'partner', a: 'a', b: 'b', startDate: '', endDate: '2015' },
    };
    expect(collectTreeWarnings(people, rels)).toEqual([]);
  });
});
