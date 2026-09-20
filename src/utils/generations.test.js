import { describe, it, expect } from 'vitest';
import {
  computeGenerations,
  wouldCreateCycle,
  ancestorsOf,
  parentsOf,
  childrenOf,
  partnersOf,
  activePartnersOf,
  inferSiblingType,
  siblingGroupOf,
  planSiblingMerge,
  findUnlinkedPartnerChildren,
  partnerChildLinksToWrite,
} from './generations';

function people(...ids) {
  return Object.fromEntries(ids.map((id) => [id, { id }]));
}

describe('computeGenerations', () => {
  it('puts a lone person at generation 0', () => {
    const { generation } = computeGenerations(people('a'), {});
    expect(generation.a).toBe(0);
  });

  it('puts a child one generation below its parent', () => {
    const p = people('parent', 'child');
    const rels = { r1: { kind: 'parent', a: 'parent', b: 'child' } };
    const { generation } = computeGenerations(p, rels);
    expect(generation.parent).toBe(0);
    expect(generation.child).toBe(1);
  });

  it('keeps partners and siblings at the same generation', () => {
    const p = people('a', 'b', 'c');
    const rels = {
      r1: { kind: 'partner', a: 'a', b: 'b' },
      r2: { kind: 'sibling', a: 'a', b: 'c' },
    };
    const { generation } = computeGenerations(p, rels);
    expect(generation.a).toBe(generation.b);
    expect(generation.a).toBe(generation.c);
  });

  it('normalises each disconnected group to start at 0', () => {
    // grandparent -> parent -> child in one group, a lone floater in another
    const p = people('gp', 'parent', 'child', 'floater');
    const rels = {
      r1: { kind: 'parent', a: 'gp', b: 'parent' },
      r2: { kind: 'parent', a: 'parent', b: 'child' },
    };
    const { generation } = computeGenerations(p, rels);
    expect(generation.gp).toBe(0);
    expect(generation.parent).toBe(1);
    expect(generation.child).toBe(2);
    expect(generation.floater).toBe(0);
  });

  it('imposes no generation constraint for an "other" relationship', () => {
    const p = people('a', 'b');
    const rels = { r1: { kind: 'other', a: 'a', b: 'b' } };
    const { generation, conflicts } = computeGenerations(p, rels);
    // Each stays in its own component, both normalised to 0.
    expect(generation.a).toBe(0);
    expect(generation.b).toBe(0);
    expect(conflicts.size).toBe(0);
  });

  it('flags a contradiction and keeps the tree rendering with the first assignment', () => {
    // a is both b's parent AND b's partner -- a's generation must be one
    // below AND equal to b's, which can't both hold.
    const p = people('a', 'b');
    const rels = {
      r1: { kind: 'parent', a: 'b', b: 'a' }, // a is one gen below b
      r2: { kind: 'partner', a: 'a', b: 'b' }, // a is same gen as b
    };
    const { generation, conflicts } = computeGenerations(p, rels);
    expect(conflicts.has('a')).toBe(true);
    expect(conflicts.has('b')).toBe(true);
    // Still assigned something, not left undefined.
    expect(Number.isFinite(generation.a)).toBe(true);
    expect(Number.isFinite(generation.b)).toBe(true);
  });

  it('ignores a relationship pointing at a person no longer in the people map', () => {
    const p = people('a');
    const rels = { r1: { kind: 'parent', a: 'a', b: 'ghost' } };
    const { generation } = computeGenerations(p, rels);
    expect(generation.a).toBe(0);
    expect(generation.ghost).toBeUndefined();
  });
});

describe('ancestorsOf / wouldCreateCycle', () => {
  const p = people('gp', 'parent', 'child');
  const rels = {
    r1: { kind: 'parent', a: 'gp', b: 'parent' },
    r2: { kind: 'parent', a: 'parent', b: 'child' },
  };

  it('walks every ancestor transitively', () => {
    const found = ancestorsOf('child', p, rels);
    expect(found).toEqual(new Set(['parent', 'gp']));
  });

  it('flags making someone their own parent', () => {
    expect(wouldCreateCycle('a', 'a', p, rels)).toBe(true);
  });

  it('flags making a descendant into an ancestor', () => {
    // child becoming gp's parent would make gp its own ancestor via the
    // existing gp -> parent -> child chain.
    expect(wouldCreateCycle('child', 'gp', p, rels)).toBe(true);
  });

  it('allows a link that does not close a loop', () => {
    expect(wouldCreateCycle('gp', 'child', p, rels)).toBe(false);
  });
});

describe('parentsOf / childrenOf / partnersOf / activePartnersOf', () => {
  const rels = {
    r1: { kind: 'parent', a: 'mom', b: 'kid' },
    r2: { kind: 'parent', a: 'dad', b: 'kid' },
    r3: { kind: 'partner', a: 'mom', b: 'dad', status: 'together' },
    r4: { kind: 'partner', a: 'mom', b: 'ex', status: 'divorced' },
  };

  it('lists both parents of a child', () => {
    expect(parentsOf('kid', rels)).toEqual(['mom', 'dad']);
  });

  it('lists children of a parent', () => {
    expect(childrenOf('mom', rels)).toEqual(['kid']);
  });

  it('lists every partner regardless of status', () => {
    expect(partnersOf('mom', rels).sort()).toEqual(['dad', 'ex']);
  });

  it('active partners excludes divorced/separated/widowed links', () => {
    expect(activePartnersOf('mom', rels)).toEqual(['dad']);
  });
});

describe('inferSiblingType', () => {
  it('returns null for missing or identical ids', () => {
    expect(inferSiblingType(null, 'b', {})).toBeNull();
    expect(inferSiblingType('a', 'a', {})).toBeNull();
  });

  it('calls two people with both shared parents on birth links full siblings', () => {
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a', type: 'birth' },
      r2: { kind: 'parent', a: 'dad', b: 'a', type: 'birth' },
      r3: { kind: 'parent', a: 'mom', b: 'b', type: 'birth' },
      r4: { kind: 'parent', a: 'dad', b: 'b', type: 'birth' },
    };
    expect(inferSiblingType('a', 'b', rels)?.type).toBe('full');
  });

  it('calls it adopted when a shared parent link is not birth on either side', () => {
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a', type: 'birth' },
      r2: { kind: 'parent', a: 'dad', b: 'a', type: 'birth' },
      r3: { kind: 'parent', a: 'mom', b: 'b', type: 'adoptive' },
      r4: { kind: 'parent', a: 'dad', b: 'b', type: 'birth' },
    };
    expect(inferSiblingType('a', 'b', rels)?.type).toBe('adopted');
  });

  it('calls half siblings when exactly one parent is shared and both have a second parent on record', () => {
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a' },
      r2: { kind: 'parent', a: 'dad1', b: 'a' },
      r3: { kind: 'parent', a: 'mom', b: 'b' },
      r4: { kind: 'parent', a: 'dad2', b: 'b' },
    };
    expect(inferSiblingType('a', 'b', rels)?.type).toBe('half');
  });

  it('refuses to guess when one shared parent is recorded but the second parent is missing', () => {
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a' },
      r2: { kind: 'parent', a: 'mom', b: 'b' },
    };
    expect(inferSiblingType('a', 'b', rels)).toBeNull();
  });

  it('calls step siblings when no parent is shared but the parents are partners', () => {
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a' },
      r2: { kind: 'parent', a: 'dad', b: 'b' },
      r3: { kind: 'partner', a: 'mom', b: 'dad' },
    };
    expect(inferSiblingType('a', 'b', rels)?.type).toBe('step');
  });

  it('returns null when there is nothing at all to go on', () => {
    expect(inferSiblingType('a', 'b', {})).toBeNull();
  });
});

describe('siblingGroupOf', () => {
  it('walks transitively through chained sibling links', () => {
    const rels = {
      r1: { kind: 'sibling', a: 'a', b: 'b' },
      r2: { kind: 'sibling', a: 'b', b: 'c' },
    };
    // a and c have no direct link, but are in the same group via b.
    expect(siblingGroupOf('a', rels)).toEqual(new Set(['b', 'c']));
  });

  it('does not include the person themselves', () => {
    const rels = { r1: { kind: 'sibling', a: 'a', b: 'b' } };
    expect(siblingGroupOf('a', rels).has('a')).toBe(false);
  });
});

describe('planSiblingMerge', () => {
  it('blocks when the two ids are missing or identical', () => {
    expect(planSiblingMerge(null, 'b', 'full', {}).blocked).toBeTruthy();
    expect(planSiblingMerge('a', 'a', 'full', {}).blocked).toBeTruthy();
  });

  it('blocks when the explicit pair already contradicts the board', () => {
    const rels = { r1: { kind: 'parent', a: 'a', b: 'b' } };
    const result = planSiblingMerge('a', 'b', 'full', rels);
    expect(result.blocked).toBeTruthy();
    expect(result.pairs).toEqual([]);
  });

  it('writes just the explicit pair when neither side has an existing sibling group', () => {
    const result = planSiblingMerge('a', 'b', 'full', {});
    expect(result.blocked).toBeNull();
    expect(result.pairs).toEqual([{ kind: 'sibling', a: 'a', b: 'b', details: { type: 'full' } }]);
    expect(result.impliedCount).toBe(0);
  });

  it('implies every cross-pair when merging two existing sibling groups', () => {
    // Group A: a1, a2 (already siblings). Group B: b1, b2 (already siblings).
    // Linking a1-b1 should imply a1-b2, a2-b1, a2-b2 as well.
    const rels = {
      r1: { kind: 'sibling', a: 'a1', b: 'a2' },
      r2: { kind: 'sibling', a: 'b1', b: 'b2' },
    };
    const result = planSiblingMerge('a1', 'b1', 'full', rels);
    expect(result.blocked).toBeNull();

    // a1-a2 and b1-b2 are already recorded, so only the four CROSS pairs
    // are new relationships to write.
    const pairKeys = result.pairs.map((p) => [p.a, p.b].sort().join('|')).sort();
    expect(pairKeys).toEqual(['a1|b1', 'a1|b2', 'a2|b1', 'a2|b2'].sort());

    // a1-b1 is the explicit pair; a1-b2, a2-b1, a2-b2 are implied.
    expect(result.impliedCount).toBe(3);
  });

  it('never emits a pair that already exists as a sibling link', () => {
    const rels = {
      r1: { kind: 'sibling', a: 'a1', b: 'a2' },
      r2: { kind: 'sibling', a: 'a1', b: 'b1' }, // already recorded
    };
    const result = planSiblingMerge('a2', 'b1', 'full', rels);
    const pairKeys = result.pairs.map((p) => [p.a, p.b].sort().join('|'));
    expect(pairKeys).not.toContain('a1|b1');
  });

  it('skips an implied pair that would contradict an existing parent/partner link, without blocking the whole merge', () => {
    const rels = {
      r1: { kind: 'sibling', a: 'a1', b: 'a2' },
      r2: { kind: 'parent', a: 'a2', b: 'b1' }, // a2 is b1's parent -- can't also be siblings
    };
    const result = planSiblingMerge('a1', 'b1', 'full', rels);
    expect(result.blocked).toBeNull();
    // The explicit pair a1-b1 still goes through.
    const pairKeys = result.pairs.map((p) => [p.a, p.b].sort().join('|'));
    expect(pairKeys).toContain('a1|b1');
    expect(pairKeys).not.toContain('a2|b1');
    expect(result.skipped).toBe(1);
  });

  it('infers each implied pair`s own type rather than copying the explicit pair`s type', () => {
    // a1/a2 are full siblings (shared both parents on birth links).
    // b1 has no parents on record, so a2-b1's type can't be inferred and
    // falls back to the explicit pair's chosen type.
    const rels = {
      r1: { kind: 'parent', a: 'mom', b: 'a1', type: 'birth' },
      r2: { kind: 'parent', a: 'dad', b: 'a1', type: 'birth' },
      r3: { kind: 'parent', a: 'mom', b: 'a2', type: 'birth' },
      r4: { kind: 'parent', a: 'dad', b: 'a2', type: 'birth' },
      r5: { kind: 'sibling', a: 'a1', b: 'a2', details: { type: 'full' } },
    };
    const result = planSiblingMerge('a1', 'b1', 'half', rels);
    const a2b1 = result.pairs.find((p) => [p.a, p.b].sort().join('|') === 'a2|b1');
    expect(a2b1.details.type).toBe('half'); // fell back to the explicit pair's type
  });
});

describe('findUnlinkedPartnerChildren / partnerChildLinksToWrite', () => {
  it('surfaces a child linked to only one of the two new partners', () => {
    const rels = { r1: { kind: 'parent', a: 'a', b: 'kid' } };
    const candidates = findUnlinkedPartnerChildren('a', 'b', rels);
    expect(candidates).toEqual([{ childId: 'kid', existingParentId: 'a', candidateParentId: 'b' }]);
  });

  it('does not surface a child already linked to both', () => {
    const rels = {
      r1: { kind: 'parent', a: 'a', b: 'kid' },
      r2: { kind: 'parent', a: 'b', b: 'kid' },
    };
    expect(findUnlinkedPartnerChildren('a', 'b', rels)).toEqual([]);
  });

  it('converts accepted candidates into parent links in the right direction', () => {
    const accepted = [{ childId: 'kid', existingParentId: 'a', candidateParentId: 'b' }];
    expect(partnerChildLinksToWrite(accepted)).toEqual([{ kind: 'parent', a: 'b', b: 'kid' }]);
  });
});
