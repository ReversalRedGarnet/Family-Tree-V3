// Card placement rules, kept separate from React so they can be reasoned
// about (and tested) on their own.
//
// One idea runs through the whole file: every automatically-placed card
// sits on a lattice of slots, ORIGIN_X + n * SLOT_STEP, and exactly one
// function decides which slot a card gets — findNearestFreeX. Adding a
// person uses it, and so does the collision resolver, so there is only
// ever one answer to "where does this card go".
//
// The lattice is searched OUTWARD from the slot the card ideally wants,
// and ties at equal distance go to whichever candidate is nearer the
// board's centre line. That is what stops the board drifting. The previous
// version tried three fixed positions beside the anchor, claimed the
// right-hand one whether or not it was free, and left a left-to-right
// packing sweep to shove the current occupant along — so every crowded
// insertion moved the board a little further right, permanently. Nothing
// is shoved now: the newcomer goes where there is actually room, and a row
// that has drifted gets refilled from the inside out.
import {
  ROW_HEIGHT,
  TOP_MARGIN,
  SLOT_STEP,
  ORIGIN_X,
  MIN_SLOT_GAP,
} from './constants';
import { computeGenerations } from './generations';

export function rowY(gen) {
  return TOP_MARGIN + (Number.isFinite(gen) ? gen : 0) * ROW_HEIGHT;
}

// ---- The slot lattice ----

export function slotX(index) {
  return ORIGIN_X + index * SLOT_STEP;
}

export function nearestSlotIndex(x) {
  return Math.round(((Number.isFinite(x) ? x : ORIGIN_X) - ORIGIN_X) / SLOT_STEP);
}

// `obstacles` is a plain list of occupied x centres. Hand-dragged cards sit
// off the lattice, so freeness is a distance test rather than a set lookup.
function isClear(x, obstacles) {
  return obstacles.every((ox) => Math.abs(ox - x) >= MIN_SLOT_GAP);
}

// The two candidates `d` slots either side of where the card wants to be,
// in the order they should be tried.
function candidatesAt(desiredIndex, d, obstacles) {
  const left = desiredIndex - d;
  const right = desiredIndex + d;

  // Pull toward the centre line: the candidate nearer slot 0 is tried
  // first, so a row that has already spread one way is filled back in
  // rather than being extended even further out.
  if (Math.abs(left) !== Math.abs(right)) {
    return Math.abs(left) < Math.abs(right) ? [left, right] : [right, left];
  }

  // A dead heat is only possible when the card wants the centre slot
  // itself — the empty-board and new-root case. Give it to the emptier
  // half of the row so repeated additions alternate sides (0, -1, +1,
  // -2, +2) instead of piling up on one.
  const leftCount = obstacles.filter((ox) => ox < ORIGIN_X).length;
  const rightCount = obstacles.filter((ox) => ox > ORIGIN_X).length;
  if (leftCount !== rightCount) {
    return leftCount < rightCount ? [left, right] : [right, left];
  }
  return [left, right];
}

// THE slot finder. Returns the x of the free lattice slot nearest to
// `desiredIndex`, searching outward.
//
// It always terminates: an obstacle can block at most two lattice slots
// (exactly one when it happens to sit on the lattice), so a free slot is
// guaranteed within 2n + 2 steps. The trailing return is unreachable, but
// a function this central should not be able to hand back undefined.
export function findNearestFreeX(obstacles, desiredIndex) {
  if (isClear(slotX(desiredIndex), obstacles)) return slotX(desiredIndex);

  const limit = obstacles.length * 2 + 2;
  for (let d = 1; d <= limit; d += 1) {
    const pair = candidatesAt(desiredIndex, d, obstacles);
    for (let i = 0; i < pair.length; i += 1) {
      const x = slotX(pair[i]);
      if (isClear(x, obstacles)) return x;
    }
  }

  return obstacles.reduce((max, ox) => Math.max(max, ox), ORIGIN_X) + SLOT_STEP;
}

// ---- Where a card would like to be ----

// The ideal x, before the question of whether that spot is free. Anchors
// are the people the card arrives attached to: a child wants the midpoint
// of its parents, a parent wants to be directly above its child, a sibling
// wants to be beside its sibling. An explicit x wins over all of that —
// that is the user right-clicking a specific spot on the board. With
// nothing to go on, a card wants the centre line.
export function idealX(people, { anchorIds = [], x = null } = {}) {
  if (Number.isFinite(x)) return x;
  const xs = (anchorIds || [])
    .map((id) => people[id]?.position?.x)
    .filter((v) => Number.isFinite(v));
  if (!xs.length) return ORIGIN_X;
  return xs.reduce((sum, v) => sum + v, 0) / xs.length;
}

function rowObstacles(people, generation, gen, excludeId) {
  const out = [];
  Object.values(people).forEach((person) => {
    if (person.id === excludeId) return;
    if ((generation[person.id] ?? 0) !== gen) return;
    out.push(person.position?.x ?? 0);
  });
  return out;
}

// The single entry point for putting a card into a row. Everything that
// inserts a person goes through here.
export function placeCard(people, generation, { id, anchorIds, x }) {
  const gen = generation[id] ?? 0;
  const obstacles = rowObstacles(people, generation, gen, id);
  const desired = nearestSlotIndex(idealX(people, { anchorIds, x }));
  return Math.round(findNearestFreeX(obstacles, desired));
}

// ---- Collisions ----

// Adding a card never moves anyone now, but rows can still end up with two
// cards in one spot: someone changed generation under them, or a tree saved
// by an older build is being opened. Fix it by moving the LOWER-PRIORITY
// card to its own nearest free slot, rather than sweeping the row left to
// right and pushing everything along — a sweep only ever pushes right,
// which is how the board came to lean in the first place.
//
// Priority decides who keeps their exact x:
//   the card just added  — it already searched for a genuinely free slot
//   a hand-dragged card  — the user put it there on purpose
//   everyone else        — placed automatically, so fair game to move
function resolveCollisions(people, generation, newId) {
  const rows = new Map();
  Object.values(people).forEach((person) => {
    const gen = generation[person.id] ?? 0;
    if (!rows.has(gen)) rows.set(gen, []);
    rows.get(gen).push(person);
  });

  const out = { ...people };
  const rank = (p) => {
    if (p.id === newId) return 0;
    return p.placed ? 1 : 2;
  };

  rows.forEach((row) => {
    row.sort((a, b) => {
      const ar = rank(a);
      const br = rank(b);
      if (ar !== br) return ar - br;
      // Compare on a rounded key rather than a tolerance window. A window
      // is intransitive (0.0 ties 0.4, 0.4 ties 0.8, but 0.0 < 0.8), which
      // lets the sort return a different order depending on the engine's
      // pivot choice. Equality on a rounded value is a proper equivalence,
      // so the ordering is stable and total.
      const ax = Math.round(a.position?.x ?? 0);
      const bx = Math.round(b.position?.x ?? 0);
      if (ax !== bx) return ax - bx;
      // Last resort, so the result never depends on object iteration order.
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    // Claims are tested only against cards already processed, so a card is
    // moved solely because something with a better claim wanted its spot —
    // never because of a card that has yet to be looked at.
    const claimed = [];
    row.forEach((person) => {
      const x = person.position?.x ?? 0;
      if (isClear(x, claimed)) {
        claimed.push(x);
        return;
      }
      const moved = Math.round(findNearestFreeX(claimed, nearestSlotIndex(x)));
      out[person.id] = { ...person, position: { ...person.position, x: moved } };
      claimed.push(moved);
    });
  });

  return out;
}

// ---- Passes ----

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
        x: person.position?.x ?? ORIGIN_X,
        y: keep ? person.position?.y ?? rowY(gen) : rowY(gen),
      },
    };
  });

  // Rows are read after generations are assigned, so a card that has just
  // changed row is placed against the row it is actually joining.
  if (hint?.newId && people[hint.newId]) {
    const id = hint.newId;
    people[id] = {
      ...people[id],
      position: {
        ...people[id].position,
        x: placeCard(people, generation, { id, anchorIds: hint.anchorIds, x: hint.x }),
      },
    };
  }

  return { ...graph, people: resolveCollisions(people, generation, hint?.newId ?? null) };
}

// "Tidy rows" — the deliberate re-flow, and the only thing that overrides a
// hand-drag. Left-to-right order within each row is kept, gaps are closed
// up onto the lattice, and each row is centred on the board's centre line,
// so the board comes out symmetrical rather than trailing off whichever way
// it happened to grow. It is also how a tree saved by an older build gets
// onto the lattice, since a loaded graph is otherwise left untouched until
// something in it collides.
//
// A row with an even number of cards ends up half a slot right of the
// centre line; keeping every card on a whole slot is worth more than
// centring it perfectly.
export function reflowAll(graph) {
  const { generation } = computeGenerations(graph.people, graph.relationships);

  const rows = new Map();
  Object.values(graph.people).forEach((person) => {
    const gen = generation[person.id] ?? 0;
    if (!rows.has(gen)) rows.set(gen, []);
    rows.get(gen).push(person);
  });

  const people = { ...graph.people };
  rows.forEach((row, gen) => {
    row.sort((a, b) => {
      const ax = Math.round(a.position?.x ?? 0);
      const bx = Math.round(b.position?.x ?? 0);
      if (ax !== bx) return ax - bx;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    const first = -Math.floor((row.length - 1) / 2);
    row.forEach((person, i) => {
      people[person.id] = {
        ...person,
        placed: false,
        placedGen: gen,
        position: { x: slotX(first + i), y: rowY(gen) },
      };
    });
  });

  return { ...graph, people };
}
