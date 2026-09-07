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
import { computeGenerations, parentsOf, partnersOf, childrenOf, siblingGroupOf } from './generations';

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

// ---- Tidy rows: clustering within a row ----
//
// A row isn't one block to centre as a whole — it's one or more family
// clusters that each want to hang under their OWN parents, wherever those
// parents ended up. These three helpers decide, for one row, which cluster
// each person belongs to and where that cluster wants to sit; reflowAll
// below does the actual placing.

// A person's recorded parents that still exist on the board, sorted so the
// result is a stable cluster key rather than depending on relationship
// insertion order. A relationship pointing at someone who's been deleted
// can't anchor anything.
function clusterParentIds(id, people, relationships) {
  return parentsOf(id, relationships)
    .filter((pid) => people[pid])
    .sort();
}

// The key that groups a row into clusters: a person's own parent-set,
// joined into one string. Two people with the exact same set of parents —
// a full sibling pair, or the two children of one couple — land in the
// same cluster. Two people who share only ONE parent but are known to have
// a DIFFERENT second parent (real half-siblings, per inferSiblingType's own
// stricter test elsewhere) land in different clusters, because their keys
// differ.
//
// Someone with no recorded parents borrows the key of a same-row partner
// who has one: a spouse who married into the family has no parents of
// their own on the board, but belongs beside their partner's cluster, not
// off under the board's fallback centre line by themselves. Only one hop —
// a partner-of-a-partner isn't walked — which is enough for the ordinary
// case and never wrong, just occasionally uninformative for something more
// exotic (two people married to each other with neither's parents on
// record, for instance).
//
// Nobody to borrow from — a genuine root, or a floater with no parents and
// no partner who has any — gets the empty key. Every empty-key person in a
// row shares that one key, so they land in a single pooled cluster, which
// is exactly what reproduces the old whole-row centring for the root
// generation (where, by construction, nobody has parents on the board).
function clusterKeyOf(id, rowIds, people, relationships) {
  const own = clusterParentIds(id, people, relationships);
  if (own.length) return own.join('|');

  const rowSet = new Set(rowIds);
  const partnerIds = partnersOf(id, relationships)
    .filter((pid) => rowSet.has(pid))
    .sort();
  for (const partnerId of partnerIds) {
    const theirs = clusterParentIds(partnerId, people, relationships);
    if (theirs.length) return theirs.join('|');
  }
  return '';
}

// clusterKeyOf's pooling of every parentless person in a row into one shared '' cluster is right
// for clusterCenterX (nobody to average, so fall back to the board's centre line) but wrong for
// grouping: two unrelated root couples, each with no recorded parents of their own, would
// otherwise be treated as ONE family for reservation purposes, and a crowded couple's extra
// width would just pad the edges of that combined block instead of widening the gap next to the
// couple that actually needs it. This is clusterKeyOf's grouping half, minus that pooling: a
// parentless person's identity is their own id plus any same-row partner AND sibling group (real
// siblings — linked by an explicit sibling relationship, not merely "also parentless" — still
// belong together), so unrelated root couples get separate identities while an actual sibling
// group, parents unknown, still reserves and centres as the one family it is. Used wherever
// clusters are being GROUPED for width reservation (buildClustersByGen, layoutAnchorRow) — never
// for clusterCenterX, which must keep returning the board centre line for a genuinely empty key.
function clusterIdentityKey(id, rowIds, people, relationships) {
  const parentKey = clusterKeyOf(id, rowIds, people, relationships);
  if (parentKey) return parentKey;

  const rowSet = new Set(rowIds);
  const unit = new Set([id]);
  partnersOf(id, relationships).forEach((pid) => {
    if (rowSet.has(pid)) unit.add(pid);
  });
  siblingGroupOf(id, relationships).forEach((sid) => {
    if (rowSet.has(sid)) unit.add(sid);
  });
  return [...unit].sort().join('|');
}

// Where a cluster wants to sit: the average x of its parents, read from
// `people` — which, mid-reflow, already holds this pass's NEW positions for
// every earlier (shallower) generation, not the stale ones the parents
// started the pass with. The empty key (no parents at all) falls back to
// the board's fixed centre line, same as today's root-generation default.
function clusterCenterX(key, people) {
  if (!key) return ORIGIN_X;
  const xs = key.split('|').map((pid) => people[pid]?.position?.x ?? ORIGIN_X);
  return xs.reduce((sum, v) => sum + v, 0) / xs.length;
}

// The mirror image of clusterParentIds/clusterKeyOf/clusterCenterX, for rows
// ABOVE the widest generation (see reflowAll): once the widest row has set
// the tree's horizontal scale, everything above it is worked out bottom-up
// instead of top-down, so a parent couple needs to be keyed and centred on
// their OWN CHILDREN rather than their own parents.
function clusterChildIds(id, people, relationships) {
  return childrenOf(id, relationships)
    .filter((cid) => people[cid])
    .sort();
}

// Two partners who parent the exact same set of children land in the same
// cluster, the same way two full siblings share a cluster below. A partner
// with no recorded children of their own borrows the key of a same-row
// partner who has some — the step-parent case — one hop only, same rule as
// clusterKeyOf's own fallback.
function clusterKeyByChildren(id, rowIds, people, relationships) {
  const own = clusterChildIds(id, people, relationships);
  if (own.length) return own.join('|');

  const rowSet = new Set(rowIds);
  const partnerIds = partnersOf(id, relationships)
    .filter((pid) => rowSet.has(pid))
    .sort();
  for (const partnerId of partnerIds) {
    const theirs = clusterChildIds(partnerId, people, relationships);
    if (theirs.length) return theirs.join('|');
  }
  return '';
}

// Where such a cluster wants to sit: the average x of its OWN children, read
// from `people` — which, by the time a row above the anchor is placed,
// already holds this pass's new position for every row below it, all the
// way down to the anchor row itself. Nobody's children on the board at all
// (a childless floater) falls back to the board's centre line, same as
// clusterCenterX's own empty-key case.
function clusterCenterXByChildren(key, people) {
  if (!key) return ORIGIN_X;
  const xs = key.split('|').map((cid) => people[cid]?.position?.x ?? ORIGIN_X);
  return xs.reduce((sum, v) => sum + v, 0) / xs.length;
}

// ---- Tidy rows: reserving room for descendants ----
//
// Centring a cluster on its own parents' midpoint (clusterCenterX above) only actually happens
// if a neighbouring cluster never crowds into the room that centring needs — and a family's
// descendants can need far more width than its own member count once grandchildren, and their
// own children, are considered. That is true WITHIN a cluster too: two siblings sharing one
// parent cluster can each go on to have very different numbers of children of their own, and
// simply padding the two ends of their shared block (as if the whole sibling group were one
// opaque unit) leaves no room between the two of them for their own, separately sized, families
// to hang without crowding each other. So the unit that actually needs its own reserved width
// isn't the cluster — it's each "branch" within it: a couple who are partners of each other stay
// paired (their cards must sit together no matter which of the two a child's record lists first),
// but two siblings, or a sibling and their married-in partner's OWN birth cluster, are independent
// branches, each reserving exactly what their own descendants need.
//
// These helpers compute that ahead of time, structurally, before anyone below the anchor row is
// placed: buildClustersByGen groups every generation into the same parent-keyed clusters
// clusterIdentityKey already uses, and computeDownWidths then walks that structure bottom-up,
// branch by branch, to work out how many slots each branch — and each whole cluster — needs
// reserved around it.

// Every generation's clusters, grouped purely from relationship structure (so this can run once,
// before any row has a final position).
function buildClustersByGen(sortedGens, rowIdsByGen, people, relationships) {
  const byGen = new Map(); // gen -> Map(key -> members[])
  sortedGens.forEach((gen) => {
    const rowIds = rowIdsByGen.get(gen);
    const keyed = new Map();
    rowIds.forEach((id) => {
      const key = clusterIdentityKey(id, rowIds, people, relationships);
      if (!keyed.has(key)) keyed.set(key, []);
      keyed.get(key).push(id);
    });
    byGen.set(gen, keyed);
  });
  return byGen;
}

// A cluster's members, split into the smaller branches that actually need independent width and
// placement: two same-row partners stay paired as one branch; everyone else in the cluster is
// their own. Each branch's own id order is preserved from `members`, and a partner already
// folded into an earlier branch is skipped when its own turn comes up.
function splitIntoBranches(members, relationships) {
  const memberSet = new Set(members);
  const consumed = new Set();
  const branches = [];
  members.forEach((id) => {
    if (consumed.has(id)) return;
    const partnerId = partnersOf(id, relationships).find(
      (pid) => pid !== id && memberSet.has(pid) && !consumed.has(pid)
    );
    const ids = partnerId ? [id, partnerId] : [id];
    ids.forEach((memberId) => consumed.add(memberId));
    branches.push(ids);
  });
  return branches;
}

// The child clusters (one generation down) a given branch is directly responsible for: those
// whose recorded parents' primary (first-sorted) id is one of this branch's own members. A child
// cluster whose two parents come from two different birth-family clusters (one married in but
// kept their own parents on the board) is attributed to whichever parent sorts first, so its
// width counts toward exactly one side's reservation rather than being double-booked or dropped —
// the one case this can't perfectly reserve room for; layoutReservedRow's nudge-right fallback
// catches the rare overlap that results.
function branchChildKeys(gen, branchIds, byGen) {
  const childClusters = byGen.get(gen + 1);
  if (!childClusters) return [];
  const branchSet = new Set(branchIds);
  const keys = [];
  childClusters.forEach((_members, childKey) => {
    if (!childKey) return; // no recorded parents at all — not attributable to any branch
    if (branchSet.has(childKey.split('|')[0])) keys.push(childKey);
  });
  return keys;
}

// Computed bottom-up, from the deepest generation back up to `fromGen`: how many slots every
// branch, and every whole cluster, needs reserved around it once its own descendants are
// accounted for. A cluster's reserved width is its branches placed side by side, each keeping its
// own — a one-slot gap is only inserted between two adjacent branches that BOTH go on to have
// children of their own, since there is nothing to separate a childless sibling from their
// neighbour; an ordinary sibling row with no descendants below still packs exactly as tightly as
// it always has.
function computeDownWidths(sortedGens, fromGen, byGen, relationships) {
  const clusterWidth = new Map(); // "gen:key" -> slots
  const branchWidth = new Map(); // "gen:branchFirstId" -> slots
  const branchHasKids = new Map(); // "gen:branchFirstId" -> bool
  const branchesOfCluster = new Map(); // "gen:key" -> id[][]

  const gensDesc = sortedGens.filter((gen) => gen >= fromGen).sort((a, b) => b - a);
  gensDesc.forEach((gen) => {
    byGen.get(gen).forEach((members, key) => {
      const branches = splitIntoBranches(members, relationships);
      branchesOfCluster.set(`${gen}:${key}`, branches);

      let total = 0;
      branches.forEach((ids, i) => {
        const childKeys = branchChildKeys(gen, ids, byGen);
        let childTotal = childKeys.reduce((sum, ck) => sum + (clusterWidth.get(`${gen + 1}:${ck}`) ?? 0), 0);
        if (childKeys.length > 1) childTotal += childKeys.length - 1;
        const width = Math.max(ids.length, childTotal);
        branchWidth.set(`${gen}:${ids[0]}`, width);
        branchHasKids.set(`${gen}:${ids[0]}`, childKeys.length > 0);

        total += width;
        if (i > 0) {
          const prevFirstId = branches[i - 1][0];
          if (branchHasKids.get(`${gen}:${prevFirstId}`) && childKeys.length > 0) total += 1;
        }
      });

      clusterWidth.set(`${gen}:${key}`, total);
    });
  });

  return { clusterWidth, branchWidth, branchHasKids, branchesOfCluster };
}

// Places one cluster's members starting at `startSlot`, branch by branch (see splitIntoBranches
// and computeDownWidths above): each branch is centred within its OWN reserved width — an even
// branch, like a two-member couple, ends up half a slot right of its own centre, the same
// convention used everywhere in this file — with the same conditional one-slot gap between
// branches that computeDownWidths reserved room for. Returns the slot just past the cluster's own
// reserved span, i.e. the caller's next starting point before any between-CLUSTER gap is added.
function placeClusterBranches(branches, startSlot, gen, people, downWidths) {
  const { branchWidth, branchHasKids } = downWidths;
  let slot = startSlot;
  branches.forEach((ids, i) => {
    if (i > 0) {
      const prevFirstId = branches[i - 1][0];
      if (branchHasKids.get(`${gen}:${prevFirstId}`) && branchHasKids.get(`${gen}:${ids[0]}`)) slot += 1;
    }
    const width = branchWidth.get(`${gen}:${ids[0]}`) ?? ids.length;
    const offset = Math.floor((width - ids.length) / 2);
    ids.forEach((id, j) => {
      people[id] = {
        ...people[id],
        placed: false,
        placedGen: gen,
        position: { x: slotX(slot + offset + j), y: rowY(gen) },
      };
    });
    slot += width;
  });
  return slot;
}

// Left-to-right order within a row, pre-clustering: existing x, then id as
// the deterministic last resort. Every row uses this same tie-break, so
// re-running Tidy on an already-tidy board never reshuffles anyone.
function stableRowOrder(rowIds, originalPeople) {
  return [...rowIds].sort((a, b) => {
    const ax = Math.round(originalPeople[a].position?.x ?? 0);
    const bx = Math.round(originalPeople[b].position?.x ?? 0);
    if (ax !== bx) return ax - bx;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}

// Places one row's worth of clusters, each centred on whatever `centerFn`
// says it wants (a cluster's own parents, or its own children — see the two
// call sites in reflowAll below). Clusters are ordered left-to-right by that
// same centre, then placed outward from it in that order; a cluster is only
// ever nudged RIGHT of its ideal centre, and only when it would otherwise
// overlap the cluster just placed to its left. Nudging left is never done —
// that would either disturb the cluster before it or drift the row the same
// way a naive left-to-right sweep used to (see the module-level comment on
// findNearestFreeX). One empty lattice slot is left between adjacent
// clusters so two branches read as visibly separate groups rather than one
// continuous row.
//
// A cluster with an even number of members ends up half a slot right of its
// own centre; keeping every card on a whole slot is worth more than
// centring it perfectly. Mutates `people` in place — the accumulating
// working copy every row of one reflowAll pass shares.
function layoutRelativeRow(rowIds, gen, people, relationships, keyFn, centerFn) {
  const clusters = new Map();
  rowIds.forEach((id) => {
    const key = keyFn(id, rowIds, people, relationships);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(id);
  });

  const ordered = [...clusters.entries()]
    .map(([key, members]) => ({ members, centerX: centerFn(key, people) }))
    .sort((a, b) => {
      if (a.centerX !== b.centerX) return a.centerX - b.centerX;
      // Same centre — order by whichever cluster's leftmost member would
      // sort first, so the result never depends on Map iteration order.
      const am = a.members[0];
      const bm = b.members[0];
      if (am < bm) return -1;
      if (am > bm) return 1;
      return 0;
    });

  let nextFreeSlot = -Infinity;
  ordered.forEach(({ members, centerX }) => {
    const half = Math.floor((members.length - 1) / 2);
    let firstSlot = nearestSlotIndex(centerX) - half;
    if (firstSlot < nextFreeSlot) firstSlot = nextFreeSlot;
    const lastSlot = firstSlot + members.length - 1;

    members.forEach((id, i) => {
      people[id] = {
        ...people[id],
        placed: false,
        placedGen: gen,
        position: { x: slotX(firstSlot + i), y: rowY(gen) },
      };
    });

    nextFreeSlot = lastSlot + 2; // +1 for the last slot itself, +1 for the gap
  });
}

// Places one row's clusters centred on `centerFn`'s ideal x, each reserving `downWidths`'
// clusterWidth rather than just its own member count — see computeDownWidths above. Reserved
// spans are placed left to right in ideal-centre order with a one-slot gap between them, exactly
// like layoutRelativeRow; a span is nudged right only when it would otherwise overlap the span
// just placed to its left, and correct reservations make that rare, since a cluster's own parent
// should already have left it enough room (see the module comment on reflowAll). Within its span,
// a cluster is placed branch by branch (placeClusterBranches), not as one flat block, so the
// cluster's own midpoint still lands exactly on `centerFn`'s ideal x whenever no nudge was
// needed, AND each branch within it gets its own proportional share of any reserved slack —
// reserving extra room never itself decentres anyone, at any depth.
function layoutReservedRow(rowIds, gen, people, relationships, keyFn, centerFn, downWidths) {
  const clusters = new Map();
  rowIds.forEach((id) => {
    const key = keyFn(id, rowIds, people, relationships);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(id);
  });

  const ordered = [...clusters.entries()]
    .map(([key, members]) => ({ key, members, centerX: centerFn(key, people) }))
    .sort((a, b) => {
      if (a.centerX !== b.centerX) return a.centerX - b.centerX;
      // Same centre — order by whichever cluster's leftmost member would
      // sort first, so the result never depends on Map iteration order.
      const am = a.members[0];
      const bm = b.members[0];
      if (am < bm) return -1;
      if (am > bm) return 1;
      return 0;
    });

  let nextFreeSlot = -Infinity;
  ordered.forEach(({ key, members, centerX }) => {
    const reserved = downWidths.clusterWidth.get(`${gen}:${key}`) ?? members.length;
    const reservedHalf = Math.floor((reserved - 1) / 2);
    let firstSlot = nearestSlotIndex(centerX) - reservedHalf;
    if (firstSlot < nextFreeSlot) firstSlot = nextFreeSlot;

    const branches = downWidths.branchesOfCluster.get(`${gen}:${key}`) ?? splitIntoBranches(members, relationships);
    const end = placeClusterBranches(branches, firstSlot, gen, people, downWidths);

    nextFreeSlot = end + 1; // +1 for the gap after this cluster
  });
}

// Lays out the anchor row itself: the generation with the most people, with
// nothing above or below it yet to take a centre from. Grouped by
// clusterIdentityKey rather than plain clusterKeyOf, so that a row full of
// parentless root couples still reserves and places each couple separately
// (see clusterIdentityKey above) instead of treating the whole row as one
// family — but placed as one evenly spaced block — one empty slot between
// clusters, same as everywhere else — centred on the board's centre line as
// a whole, since this row is what gives that centre line meaning for the
// rest of the tree. Each cluster still reserves its downWidths.clusterWidth
// slot count, placed branch by branch exactly like layoutReservedRow, so its
// own descendants get room too: the anchor row sets the tree's scale, but a
// family's spread further down can still widen the gap either side of it.
function layoutAnchorRow(rowIds, gen, people, relationships, downWidths) {
  const clusters = new Map();
  rowIds.forEach((id) => {
    const key = clusterIdentityKey(id, rowIds, people, relationships);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(id);
  });
  // A Map preserves insertion order, so grouping the pre-sorted row this way
  // keeps clusters — and each cluster's own members — left-to-right too.
  const orderedKeys = [...clusters.keys()];
  const reservedOf = (key) => downWidths.clusterWidth.get(`${gen}:${key}`) ?? clusters.get(key).length;

  const totalSlots =
    orderedKeys.reduce((sum, key) => sum + reservedOf(key), 0) + Math.max(0, orderedKeys.length - 1);
  // Same convention as a single cluster centring on its own middle: an even
  // total ends up half a slot right of centre rather than splitting a card
  // across the line.
  let slot = -Math.floor((totalSlots - 1) / 2);

  orderedKeys.forEach((key) => {
    const members = clusters.get(key);
    const branches = downWidths.branchesOfCluster.get(`${gen}:${key}`) ?? splitIntoBranches(members, relationships);
    const end = placeClusterBranches(branches, slot, gen, people, downWidths);
    slot = end + 1; // +1 for the gap before the next cluster
  });
}

// "Tidy rows" — the deliberate re-flow, and the only thing that overrides a
// hand-drag.
//
// The generation with the most people still sets the horizontal scale of the whole tree: it is
// laid out FIRST, evenly spaced with no reference to anyone else, and every other generation is
// positioned relative to it — never the other way around. But "centred under its own parents" is
// the rule every generation below the anchor has to obey, not just a preference to satisfy when
// convenient: before any of those rows are placed, computeDownWidths walks the whole subtree
// below the anchor bottom-up and works out how much horizontal room each family branch actually
// needs, all the way down to its own leaves. Placing the anchor row — and every row below it —
// then reserves THAT much room per cluster, not just its own member count, so a crowded branch
// automatically pushes its neighbour (and that neighbour's own parents, since they were reserved
// the same way one generation up) sideways to make room, rather than ever nudging a cluster off
// its own parents' midpoint. Generations above the anchor are the mirror image, processed
// bottom-up: each cluster centred over its OWN children (clusterKeyByChildren /
// clusterCenterXByChildren), who by then already have their final position — a row here is far
// less prone to the same crowding, since its children were already spaced with room to spare, so
// it keeps the simpler member-count reservation from before this change.
//
// A hand-dragged (placed: true) card is not exempt here — Tidy rows is the
// one thing that overrides a hand-drag, same as before this change.
export function reflowAll(graph) {
  const { generation } = computeGenerations(graph.people, graph.relationships);
  const { relationships } = graph;

  const rowIdsByGen = new Map();
  Object.values(graph.people).forEach((person) => {
    const gen = generation[person.id] ?? 0;
    if (!rowIdsByGen.has(gen)) rowIdsByGen.set(gen, []);
    rowIdsByGen.get(gen).push(person.id);
  });

  if (!rowIdsByGen.size) return { ...graph, people: {} };

  const people = { ...graph.people };
  const sortedGens = [...rowIdsByGen.keys()].sort((a, b) => a - b);

  // Ties go to the shallowest generation, purely so the choice is
  // deterministic regardless of Map iteration order.
  let widestGen = sortedGens[0];
  sortedGens.forEach((gen) => {
    if (rowIdsByGen.get(gen).length > rowIdsByGen.get(widestGen).length) widestGen = gen;
  });

  // Bottom-up pass: how much room does every family branch from the anchor row down actually
  // need, once its own descendants are accounted for?
  const byGen = buildClustersByGen(sortedGens, rowIdsByGen, graph.people, relationships);
  const downWidths = computeDownWidths(sortedGens, widestGen, byGen, relationships);

  layoutAnchorRow(stableRowOrder(rowIdsByGen.get(widestGen), graph.people), widestGen, people, relationships, downWidths);

  sortedGens
    .filter((gen) => gen > widestGen)
    .forEach((gen) => {
      const rowIds = stableRowOrder(rowIdsByGen.get(gen), graph.people);
      layoutReservedRow(rowIds, gen, people, relationships, clusterKeyOf, clusterCenterX, downWidths);
    });

  sortedGens
    .filter((gen) => gen < widestGen)
    .sort((a, b) => b - a) // bottom-up: closest to the anchor first
    .forEach((gen) => {
      const rowIds = stableRowOrder(rowIdsByGen.get(gen), graph.people);
      layoutRelativeRow(rowIds, gen, people, relationships, clusterKeyByChildren, clusterCenterXByChildren);
    });

  return { ...graph, people };
}
