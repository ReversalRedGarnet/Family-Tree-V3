// Card placement rules, kept separate from React so they can be reasoned
// about (and tested) on their own.
import { ROW_HEIGHT, TOP_MARGIN, SLOT_STEP } from './constants';
import { computeGenerations } from './generations';

export function rowY(gen) {
  return TOP_MARGIN + (Number.isFinite(gen) ? gen : 0) * ROW_HEIGHT;
}

// Picks where a brand-new card should land: beside its anchor, on whichever
// side actually has room. If both sides are taken it claims the right-hand
// slot anyway and packRows shoves the current occupant further along.
function chooseSlot(people, generation, hint) {
  const { newId, anchorId, prefer = ['right', 'left'] } = hint;
  const gen = generation[newId] ?? 0;
  const anchorX = people[anchorId]?.position?.x ?? people[newId]?.position?.x ?? 360;

  const neighbours = Object.values(people).filter(
    (p) => p.id !== newId && (generation[p.id] ?? 0) === gen
  );
  const isFree = (x) =>
    neighbours.every((p) => Math.abs((p.position?.x ?? 0) - x) >= SLOT_STEP - 1);

  const offsets = { center: 0, right: SLOT_STEP, left: -SLOT_STEP };
  for (const side of prefer) {
    const x = anchorX + (offsets[side] ?? 0);
    if (isFree(x)) return x;
  }
  return anchorX + SLOT_STEP;
}

// Sweeps each generation row left to right and pushes anything that would
// overlap further right. This runs on structural changes only, so it never
// fights a drag in progress.
function packRows(people, generation, priorityId = null) {
  const rows = new Map();
  Object.values(people).forEach((person) => {
    const gen = generation[person.id] ?? 0;
    if (!rows.has(gen)) rows.set(gen, []);
    rows.get(gen).push(person);
  });

  const out = { ...people };
  rows.forEach((row) => {
    row.sort((a, b) => {
      // Compare on a rounded key rather than a tolerance window. A window
      // is intransitive (0.0 ties 0.4, 0.4 ties 0.8, but 0.0 < 0.8), which
      // lets the sort return a different order depending on the engine's
      // pivot choice. Equality on a rounded value is a proper equivalence,
      // so the ordering is stable and total.
      const ax = Math.round(a.position?.x ?? 0);
      const bx = Math.round(b.position?.x ?? 0);
      if (ax !== bx) return ax - bx;
      // Genuine tie: the newcomer takes the slot and the card already
      // sitting there is the one that gets shoved along.
      const aPriority = a.id === priorityId;
      const bPriority = b.id === priorityId;
      if (aPriority !== bPriority) return aPriority ? -1 : 1;
      // Last resort, so the result never depends on object iteration order.
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    for (let i = 1; i < row.length; i += 1) {
      const prev = out[row[i - 1].id];
      const current = out[row[i].id];
      const needed = (prev.position?.x ?? 0) + SLOT_STEP;
      if ((current.position?.x ?? 0) < needed) {
        out[current.id] = { ...current, position: { ...current.position, x: needed } };
      }
    }
  });
  return out;
}

export function autoLayout(graph, hint = null) {
  const { generation } = computeGenerations(graph.people, graph.relationships);
  const people = {};

  Object.entries(graph.people).forEach(([id, person]) => {
    const gen = generation[id] ?? 0;
    // A dragged card keeps exactly where it was put — unless new links have
    // since moved it to a different generation, in which case its old row is
    // simply the wrong one.
    const keep = person.placed && person.placedGen === gen;
    people[id] = {
      ...person,
      placed: keep,
      placedGen: gen,
      position: {
        x: person.position?.x ?? 0,
        y: keep ? person.position?.y ?? rowY(gen) : rowY(gen),
      },
    };
  });

  if (hint?.newId && people[hint.newId]) {
    const x = hint.anchorId
      ? chooseSlot(people, generation, hint)
      : hint.x ?? people[hint.newId].position.x;
    people[hint.newId] = {
      ...people[hint.newId],
      position: { ...people[hint.newId].position, x: Math.round(x) },
    };
  }

  return { ...graph, people: packRows(people, generation, hint?.newId ?? null) };
}
