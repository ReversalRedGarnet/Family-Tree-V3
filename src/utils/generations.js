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
