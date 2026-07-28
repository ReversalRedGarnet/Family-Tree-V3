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

  const aParents = parentsOf(aId, relationships);
  const bParents = parentsOf(bId, relationships);
  const shared = aParents.filter((id) => bParents.includes(id));

  if (shared.length >= 2) {
    return { type: 'full', reason: 'They share both recorded parents.' };
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
