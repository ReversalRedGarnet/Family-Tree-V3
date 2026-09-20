import { describe, it, expect } from 'vitest';
import { findNearestFreeX, slotX, nearestSlotIndex, placeCard, idealX, autoLayout, reflowAll } from './layout';
import { ORIGIN_X, SLOT_STEP } from './constants';

describe('slotX / nearestSlotIndex', () => {
  it('round-trips a slot index through slotX and back', () => {
    for (const index of [-3, -1, 0, 1, 4]) {
      expect(nearestSlotIndex(slotX(index))).toBe(index);
    }
  });

  it('rounds an off-lattice x to its nearest slot index', () => {
    expect(nearestSlotIndex(ORIGIN_X + SLOT_STEP * 1.4)).toBe(1);
    expect(nearestSlotIndex(ORIGIN_X + SLOT_STEP * 1.6)).toBe(2);
  });
});

describe('findNearestFreeX', () => {
  it('returns the desired slot itself when nothing occupies it', () => {
    expect(findNearestFreeX([], 0)).toBe(slotX(0));
  });

  it('searches outward and picks the nearer side when the desired slot is taken', () => {
    const obstacles = [slotX(0)];
    // Slot 0 is taken; -1 and 1 are equidistant, and with an empty board
    // (no other obstacles) the tie-break falls to whichever half is
    // emptier -- here neither side has anyone, so it's a genuine dead
    // heat resolved by the leftCount/rightCount check.
    const result = findNearestFreeX(obstacles, 0);
    expect([slotX(-1), slotX(1)]).toContain(result);
  });

  it('pulls a fill-in toward the centre line rather than extending the row further out', () => {
    // Row has spread two slots to the right (1 and 2 occupied); the next
    // desired slot is 2 again (collision), so it should backfill slot 1's
    // neighbour... more directly: wanting slot 1 with 0 free and 2 taken
    // should prefer slot 0 (toward centre) over slot 2's far side.
    const obstacles = [slotX(1), slotX(2)];
    const result = findNearestFreeX(obstacles, 1);
    // Nearest free slots to index 1 are 0 (distance 1) and... 2 is taken,
    // 3 is distance 2 away, so 0 wins outright regardless of centring.
    expect(result).toBe(slotX(0));
  });

  it('given a genuine tie between two candidates, prefers the side with fewer existing obstacles', () => {
    // Desired slot 0 is taken. Left side (negative) already has one card
    // beyond the tie candidates; right side is empty. The row should fill
    // in on the emptier (right) side.
    const obstacles = [slotX(0), slotX(-3)];
    const result = findNearestFreeX(obstacles, 0);
    expect(result).toBe(slotX(1));
  });

  it('never returns a slot that collides with an existing obstacle', () => {
    const obstacles = [slotX(-1), slotX(0), slotX(1), slotX(2)];
    const result = findNearestFreeX(obstacles, 0);
    const minGapSlots = obstacles.every((ox) => Math.abs(ox - result) >= SLOT_STEP - 1);
    expect(minGapSlots).toBe(true);
  });

  it('terminates and returns a real number for a densely packed row', () => {
    const obstacles = Array.from({ length: 20 }, (_, i) => slotX(i - 10));
    const result = findNearestFreeX(obstacles, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(obstacles.every((ox) => Math.abs(ox - result) >= 1)).toBe(true);
  });
});

describe('idealX', () => {
  const people = {
    a: { position: { x: 100 } },
    b: { position: { x: 300 } },
  };

  it('uses an explicit x over anything else', () => {
    expect(idealX(people, { anchorIds: ['a', 'b'], x: 999 })).toBe(999);
  });

  it('averages the anchors when no explicit x is given', () => {
    expect(idealX(people, { anchorIds: ['a', 'b'] })).toBe(200);
  });

  it('falls back to the board centre with no anchors and no x', () => {
    expect(idealX(people, {})).toBe(ORIGIN_X);
  });

  it('ignores an anchor with no recorded position', () => {
    expect(idealX(people, { anchorIds: ['a', 'ghost'] })).toBe(100);
  });
});

describe('placeCard', () => {
  it('places a lone new card at the board centre', () => {
    const people = { a: { id: 'a', position: { x: ORIGIN_X } } };
    const generation = { a: 0 };
    const x = placeCard(people, generation, { id: 'a', anchorIds: [] });
    expect(x).toBe(ORIGIN_X);
  });

  it('does not collide with another card already in the same row', () => {
    const people = {
      existing: { id: 'existing', position: { x: ORIGIN_X } },
      newcomer: { id: 'newcomer', position: { x: ORIGIN_X } },
    };
    const generation = { existing: 0, newcomer: 0 };
    const x = placeCard(people, generation, { id: 'newcomer', anchorIds: [] });
    expect(x).not.toBe(ORIGIN_X);
  });

  it('ignores obstacles in a different generation row', () => {
    const people = {
      elsewhere: { id: 'elsewhere', position: { x: ORIGIN_X } },
      newcomer: { id: 'newcomer', position: { x: ORIGIN_X } },
    };
    const generation = { elsewhere: 1, newcomer: 0 };
    const x = placeCard(people, generation, { id: 'newcomer', anchorIds: [] });
    expect(x).toBe(ORIGIN_X);
  });
});

describe('autoLayout', () => {
  it('gives a brand-new single person a position at the board centre', () => {
    const graph = { people: { a: { id: 'a' } }, relationships: {} };
    const result = autoLayout(graph, { newId: 'a', anchorIds: [] });
    expect(result.people.a.position.x).toBe(ORIGIN_X);
  });

  it('resolves a collision deterministically regardless of object key order', () => {
    // Two people with the exact same rounded x in the same row -- the
    // exact bug class the header comment calls out: a tolerance-window
    // comparator could give a different order depending on engine pivot
    // choice, a rounded-key comparator can't.
    const graphA = {
      people: {
        a: { id: 'a', position: { x: 500.1, y: 0 } },
        b: { id: 'b', position: { x: 500.4, y: 0 } },
      },
      relationships: {},
    };
    const graphB = {
      people: {
        b: { id: 'b', position: { x: 500.4, y: 0 } },
        a: { id: 'a', position: { x: 500.1, y: 0 } },
      },
      relationships: {},
    };

    const resultA = autoLayout(graphA);
    const resultB = autoLayout(graphB);

    expect(resultA.people.a.position.x).toBe(resultB.people.a.position.x);
    expect(resultA.people.b.position.x).toBe(resultB.people.b.position.x);
    // And the two no longer collide.
    expect(resultA.people.a.position.x).not.toBe(resultA.people.b.position.x);
  });

  it('leaves a hand-placed card exactly where it was dragged, moving only the lower-priority one', () => {
    const graph = {
      people: {
        dragged: { id: 'dragged', placed: true, placedGen: 0, position: { x: ORIGIN_X, y: 0 } },
        auto: { id: 'auto', placed: false, position: { x: ORIGIN_X, y: 0 } },
      },
      relationships: {},
    };
    const result = autoLayout(graph);
    expect(result.people.dragged.position.x).toBe(ORIGIN_X);
    expect(result.people.auto.position.x).not.toBe(ORIGIN_X);
  });

  it('keeps a child near the midpoint of its two parents', () => {
    const graph = {
      people: {
        mom: { id: 'mom', placed: true, placedGen: 0, position: { x: 100, y: 0 } },
        dad: { id: 'dad', placed: true, placedGen: 0, position: { x: 300, y: 0 } },
        kid: { id: 'kid' },
      },
      relationships: {
        r1: { kind: 'parent', a: 'mom', b: 'kid' },
        r2: { kind: 'parent', a: 'dad', b: 'kid' },
      },
    };
    const result = autoLayout(graph, { newId: 'kid', anchorIds: ['mom', 'dad'] });
    // Snapped to the nearest free lattice slot, not the exact midpoint.
    expect(Math.abs(result.people.kid.position.x - 200)).toBeLessThanOrEqual(SLOT_STEP / 2);
  });
});

describe('reflowAll', () => {
  it('returns an empty people map for an empty graph', () => {
    const result = reflowAll({ people: {}, relationships: {} });
    expect(result.people).toEqual({});
  });

  it('centres a lone couple on the board centre line', () => {
    const graph = {
      people: {
        a: { id: 'a', position: { x: 900, y: 0 } },
        b: { id: 'b', position: { x: 950, y: 0 } },
      },
      relationships: { r1: { kind: 'partner', a: 'a', b: 'b' } },
    };
    const result = reflowAll(graph);
    const mid = (result.people.a.position.x + result.people.b.position.x) / 2;
    // Even pair sits half a slot right of centre per the module's own
    // convention -- within one slot step of ORIGIN_X either way.
    expect(Math.abs(mid - ORIGIN_X)).toBeLessThan(SLOT_STEP);
  });

  it('centres a child cluster under the midpoint of its own parents', () => {
    const graph = {
      people: {
        mom: { id: 'mom', position: { x: 0, y: 0 } },
        dad: { id: 'dad', position: { x: 500, y: 0 } },
        kid1: { id: 'kid1', position: { x: 0, y: 0 } },
        kid2: { id: 'kid2', position: { x: 0, y: 0 } },
      },
      relationships: {
        r1: { kind: 'partner', a: 'mom', b: 'dad' },
        r2: { kind: 'parent', a: 'mom', b: 'kid1' },
        r3: { kind: 'parent', a: 'dad', b: 'kid1' },
        r4: { kind: 'parent', a: 'mom', b: 'kid2' },
        r5: { kind: 'parent', a: 'dad', b: 'kid2' },
      },
    };
    const result = reflowAll(graph);
    const parentMid = (result.people.mom.position.x + result.people.dad.position.x) / 2;
    const childMid = (result.people.kid1.position.x + result.people.kid2.position.x) / 2;
    // Both siblings straddle their parents' midpoint (within one slot,
    // since an even pair lands half a slot off centre).
    expect(Math.abs(childMid - parentMid)).toBeLessThanOrEqual(SLOT_STEP);
  });

  it('separates two unrelated root couples into two distinct clusters, not one pooled block', () => {
    const graph = {
      people: {
        a1: { id: 'a1', position: { x: 0, y: 0 } },
        a2: { id: 'a2', position: { x: 0, y: 0 } },
        b1: { id: 'b1', position: { x: 0, y: 0 } },
        b2: { id: 'b2', position: { x: 0, y: 0 } },
      },
      relationships: {
        r1: { kind: 'partner', a: 'a1', b: 'a2' },
        r2: { kind: 'partner', a: 'b1', b: 'b2' },
      },
    };
    const result = reflowAll(graph);
    const aMid = (result.people.a1.position.x + result.people.a2.position.x) / 2;
    const bMid = (result.people.b1.position.x + result.people.b2.position.x) / 2;
    expect(aMid).not.toBe(bMid);
    // Each couple's own two members should sit closer to each other than
    // to the other couple.
    const aSpread = Math.abs(result.people.a1.position.x - result.people.a2.position.x);
    const crossSpread = Math.abs(result.people.a1.position.x - result.people.b1.position.x);
    expect(aSpread).toBeLessThan(crossSpread);
  });

  it('is idempotent: running Tidy twice in a row does not reshuffle anyone', () => {
    const graph = {
      people: {
        mom: { id: 'mom', position: { x: 40, y: 0 } },
        dad: { id: 'dad', position: { x: 900, y: 0 } },
        kid1: { id: 'kid1', position: { x: 0, y: 0 } },
        kid2: { id: 'kid2', position: { x: 0, y: 0 } },
        gc: { id: 'gc', position: { x: 0, y: 0 } },
      },
      relationships: {
        r1: { kind: 'partner', a: 'mom', b: 'dad' },
        r2: { kind: 'parent', a: 'mom', b: 'kid1' },
        r3: { kind: 'parent', a: 'dad', b: 'kid1' },
        r4: { kind: 'parent', a: 'mom', b: 'kid2' },
        r5: { kind: 'parent', a: 'dad', b: 'kid2' },
        r6: { kind: 'parent', a: 'kid1', b: 'gc' },
      },
    };
    const once = reflowAll(graph);
    const twice = reflowAll(once);
    Object.keys(once.people).forEach((id) => {
      expect(twice.people[id].position.x).toBe(once.people[id].position.x);
      expect(twice.people[id].position.y).toBe(once.people[id].position.y);
    });
  });

  it('reserves more room under a branch with more descendants, widening the gap to its childless sibling', () => {
    // gp couple -> two children, one (busy) with five kids of their own,
    // the other (quiet) with none. Extra floaters in gen 0 make it the
    // widest generation (the anchor), so busy/quiet and their row below
    // it are laid out through the reserving pass (layoutReservedRow),
    // which is what actually accounts for a branch's own descendants --
    // the mirror pass used for rows ABOVE the anchor deliberately does
    // not (see the module comment on reflowAll).
    const graph = { people: {}, relationships: {} };
    const addPerson = (id) => {
      graph.people[id] = { id, position: { x: 0, y: 0 } };
    };
    ['gp1', 'gp2', 'f1', 'f2', 'f3', 'busy', 'quiet', 'c1', 'c2', 'c3', 'c4', 'c5'].forEach(addPerson);

    graph.relationships = {
      r1: { kind: 'partner', a: 'gp1', b: 'gp2' },
      r2: { kind: 'parent', a: 'gp1', b: 'busy' },
      r3: { kind: 'parent', a: 'gp2', b: 'busy' },
      r4: { kind: 'parent', a: 'gp1', b: 'quiet' },
      r5: { kind: 'parent', a: 'gp2', b: 'quiet' },
      r6: { kind: 'parent', a: 'busy', b: 'c1' },
      r7: { kind: 'parent', a: 'busy', b: 'c2' },
      r8: { kind: 'parent', a: 'busy', b: 'c3' },
      r9: { kind: 'parent', a: 'busy', b: 'c4' },
      r10: { kind: 'parent', a: 'busy', b: 'c5' },
    };

    const result = reflowAll(graph);
    const busyToQuiet = Math.abs(result.people.busy.position.x - result.people.quiet.position.x);
    // Five grandchildren reserve five slots under "busy"; a plain sibling
    // pair with no descendants at all would sit exactly one slot apart.
    expect(busyToQuiet).toBeGreaterThan(SLOT_STEP);
  });
});
