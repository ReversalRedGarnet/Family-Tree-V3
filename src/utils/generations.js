// Generation is always DERIVED, never hand-entered.
//
// Every relationship is a constraint on the difference between two people's
// generations:
//
//   parent  a -> b   gen(b) = gen(a) + 1
//   partner a <-> b  gen(a) = gen(b)
//   sibling a <-> b  gen(a) = gen(b)
//   other            no constraint
//
// So this is a breadth-first walk over each connected group, assigning
// offsets as it goes. Groups are independent, so each one is normalised to
// start at row 0. Contradictions (someone who must be both above and below
// themselves) can't be satisfied, so the people involved are flagged and the
// first value assigned wins — rendering always proceeds.

function buildAdjacency(people, relationships) {
  const adj = new Map();
  const link = (from, to, delta) => {
    if (!people[from] || !people[to]) return; // dangling reference, skip
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, delta });
  };

  Object.values(relationships).forEach((rel) => {
    if (!rel || !rel.a || !rel.b) return;
    if (rel.kind === 'parent') {
      link(rel.a, rel.b, 1);
      link(rel.b, rel.a, -1);
    } else if (rel.kind === 'partner' || rel.kind === 'sibling') {
      link(rel.a, rel.b, 0);
      link(rel.b, rel.a, 0);
    }
    // 'other' deliberately imposes nothing
  });

  return adj;
}

export function computeGenerations(people, relationships) {
  const adj = buildAdjacency(people, relationships);
  const generation = {};
  const conflicts = new Set();
  const visited = new Set();

  Object.keys(people).forEach((start) => {
    if (visited.has(start)) return;

    const group = [];
    const queue = [start];
    visited.add(start);
    generation[start] = 0;

    while (queue.length) {
      const current = queue.shift();
      group.push(current);

      (adj.get(current) || []).forEach(({ to, delta }) => {
        const expected = generation[current] + delta;
        if (!visited.has(to)) {
          visited.add(to);
          generation[to] = expected;
          queue.push(to);
        } else if (generation[to] !== expected) {
          // Unsatisfiable: keep the first assignment, flag both ends.
          conflicts.add(to);
          conflicts.add(current);
        }
      });
    }

    // Each disconnected group starts at row 0 rather than floating.
    const min = Math.min(...group.map((id) => generation[id]));
    group.forEach((id) => {
      generation[id] -= min;
    });
  });

  return { generation, conflicts };
}

// Every ancestor of `personId`, walking up parent links.
export function ancestorsOf(personId, people, relationships) {
  const found = new Set();
  const stack = [personId];
  const rels = Object.values(relationships);

  while (stack.length) {
    const current = stack.pop();
    rels.forEach((rel) => {
      if (rel.kind !== 'parent' || rel.b !== current) return;
      if (found.has(rel.a)) return;
      found.add(rel.a);
      stack.push(rel.a);
    });
  }
  return found;
}

// Would making `parentId` the parent of `childId` make someone their own
// ancestor? Call BEFORE committing.
export function wouldCreateCycle(parentId, childId, people, relationships) {
  if (parentId === childId) return true;
  return ancestorsOf(parentId, people, relationships).has(childId);
}

// The parents of a person, in insertion order.
export function parentsOf(personId, relationships) {
  return Object.values(relationships)
    .filter((rel) => rel.kind === 'parent' && rel.b === personId)
    .map((rel) => rel.a);
}

export function partnersOf(personId, relationships) {
  return Object.values(relationships)
    .filter((rel) => rel.kind === 'partner' && (rel.a === personId || rel.b === personId))
    .map((rel) => (rel.a === personId ? rel.b : rel.a));
}

// Partners still current — status is 'together' or unset. Separated,
// divorced and widowed are all left out here, not because the link ended
// (separated hasn't), but because none of the three is a safe partner to
// *assume* someone still shares. Used wherever "the" partner matters for
// auto-linking someone new, e.g. a child only gets both parents
// auto-attached when there's exactly one of these.
export function activePartnersOf(personId, relationships) {
  return Object.values(relationships)
    .filter(
      (rel) =>
        rel.kind === 'partner' &&
        (rel.a === personId || rel.b === personId) &&
        (!rel.status || rel.status === 'together')
    )
    .map((rel) => (rel.a === personId ? rel.b : rel.a));
}

// Works out what kind of siblings two people are from the parents already on
// the board, so the user isn't re-deriving it by hand every time.
//
// Deliberately returns null rather than guessing when the recorded parentage
// is too thin to tell the difference. Two people sharing one parent are only
// half siblings if we actually know they have DIFFERENT second parents — if
// the second parent simply hasn't been entered yet, they may well be full
// siblings, and quietly labelling them "half" would be inventing a fact.
export function inferSiblingType(aId, bId, relationships) {
  if (!aId || !bId || aId === bId) return null;

  const aParentRels = Object.values(relationships).filter((r) => r.kind === 'parent' && r.b === aId);
  const bParentRels = Object.values(relationships).filter((r) => r.kind === 'parent' && r.b === bId);
  const aParents = aParentRels.map((r) => r.a);
  const bParents = bParentRels.map((r) => r.a);
  const shared = aParents.filter((id) => bParents.includes(id));

  if (shared.length >= 2) {
    // Both shared parents are on record for both of them — but if either
    // side's link to one of those shared parents is anything but a birth
    // link (adoptive, step, foster, guardian), this reads as an adopted
    // sibling relationship, not a fully biological one. A birth link on
    // BOTH sides for a shared parent is what "fully biological" actually
    // means; one adoptive link is enough to say otherwise.
    const nonBirth = shared.some((parentId) => {
      const aRel = aParentRels.find((r) => r.a === parentId);
      const bRel = bParentRels.find((r) => r.a === parentId);
      return (aRel?.type && aRel.type !== 'birth') || (bRel?.type && bRel.type !== 'birth');
    });
    return nonBirth
      ? { type: 'adopted', reason: 'They share both recorded parents, but at least one link is not a birth parent.' }
      : { type: 'full', reason: 'They share both recorded parents.' };
  }

  if (shared.length === 1) {
    // Only a confident call once both sides have a second parent on record.
    if (aParents.length >= 2 && bParents.length >= 2) {
      return { type: 'half', reason: 'They share one parent, but not the other.' };
    }
    return null; // second parent missing — genuinely can't tell yet
  }

  // No parent in common. If their parents are partners, that's a step link.
  const stepped = aParents.some((ap) =>
    partnersOf(ap, relationships).some((partnerId) => bParents.includes(partnerId))
  );
  if (stepped) {
    return {
      type: 'step',
      reason: 'They have no parent in common, but their parents are partners.',
    };
  }

  return null;
}

// Everyone currently reachable from `personId` by walking explicit sibling
// links — transitively, so if A-B and B-C are both recorded, A and C count
// as being in the same group even with no direct A-C link yet. Does NOT
// include `personId` itself. Used to merge two sibling groups into one
// whenever a new cross-group sibling link is made: siblinghood is
// transitive in the way "shares a parent" is, so a new link between two
// existing groups implies every cross-pair between them, not just the one
// pair someone actually dragged.
export function siblingGroupOf(personId, relationships) {
  const found = new Set();
  const stack = [personId];
  const rels = Object.values(relationships).filter((r) => r.kind === 'sibling');

  while (stack.length) {
    const current = stack.pop();
    rels.forEach((rel) => {
      if (rel.a !== current && rel.b !== current) return;
      const other = rel.a === current ? rel.b : rel.a;
      if (other === personId || found.has(other)) return;
      found.add(other);
      stack.push(other);
    });
  }
  return found;
}

// The plan for confirming ONE new sibling link (aId, bId, with the type the
// person chose in the dialog) into every relationship it actually implies:
// the explicit pair itself, plus a cross-link for every OTHER pair between
// A's existing sibling group and B's — the transitive closure a new
// cross-group link creates. Pure and side-effect-free on purpose, so the
// merge itself (the part actually worth getting right — a dedup bug here
// either silently drops a pair or writes a duplicate relationship) can be
// checked without a live commit.
//
// Every pair OTHER than the explicit one gets its type freshly inferred
// from recorded parentage (inferSiblingType) rather than copying the
// explicit pair's type — two people's actual shared parentage doesn't
// change just because someone else in the group got called "half"
// siblings. Where inference can't tell, the explicit pair's type is the
// closest fact-free default there is.
export function planSiblingMerge(aId, bId, type, relationships) {
  const groupA = [aId, ...siblingGroupOf(aId, relationships)];
  const groupB = [bId, ...siblingGroupOf(bId, relationships)];
  const existingPair = (x, y) =>
    Object.values(relationships).some(
      (rel) => rel.kind === 'sibling' && ((rel.a === x && rel.b === y) || (rel.a === y && rel.b === x))
    );
  // An implied pair that's already recorded as parent/child or as
  // partners can't ALSO become siblings — the same contradiction
  // validateRelationship refuses for the explicit pair, just reached here
  // through the merge instead of a direct drag. The explicit pair was
  // already checked before this ever runs; only the pairs THIS function
  // invents need checking, since nothing else has looked at them yet.
  const contradicts = (x, y) =>
    Object.values(relationships).some(
      (rel) =>
        (rel.kind === 'parent' || rel.kind === 'partner') &&
        ((rel.a === x && rel.b === y) || (rel.a === y && rel.b === x))
    );

  const seen = new Set();
  const pairs = [];
  let impliedCount = 0;
  let skipped = 0;

  groupA.forEach((x) => {
    groupB.forEach((y) => {
      if (x === y) return;
      const key = [x, y].sort().join('|');
      if (seen.has(key) || existingPair(x, y)) return;
      seen.add(key);

      const isPrimary = (x === aId && y === bId) || (x === bId && y === aId);
      if (!isPrimary && contradicts(x, y)) {
        skipped += 1;
        return;
      }

      let pairType = type;
      if (!isPrimary) {
        impliedCount += 1;
        pairType = inferSiblingType(x, y, relationships)?.type || type;
      }
      pairs.push({ kind: 'sibling', a: x, b: y, details: { type: pairType } });
    });
  });

  return { pairs, impliedCount, skipped };
}
