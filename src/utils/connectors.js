// The geometry of every line on the board, worked out once.
//
// This exists because the lines are now two things at once: something to
// draw, and something to drop a card onto. Those have to agree exactly. If
// RelationshipLines kept working out its own trunk and bus positions while
// Canvas worked out its own copy for hit-testing, the drop target would
// drift away from the drawn line the first time anyone nudged the spacing —
// and it would drift invisibly, because the line would still look right.
//
// So the shape of a connector is decided here, RelationshipLines renders
// what it is given, and the hit test measures against the same segments.
import { CARD_HEIGHT, LINE_STYLES } from './constants';

const HALF_H = CARD_HEIGHT / 2;

// Which visual style a partner link gets: status wins over type, because
// "divorced" is the more important fact than "was a marriage".
export function partnerStyleKey(rel) {
  if (rel.status && rel.status !== 'together') return rel.status;
  return rel.type || 'partner';
}

// ---- Building ----

// Parent links are grouped into a shared drop so a couple's children hang
// from one trunk instead of a fan of crossing diagonals.
function parentConnectors(rels, positions) {
  const byChild = new Map();
  rels.forEach((rel) => {
    if (rel.kind !== 'parent') return;
    if (!positions[rel.a] || !positions[rel.b]) return;
    if (!byChild.has(rel.b)) byChild.set(rel.b, []);
    byChild.get(rel.b).push(rel);
  });

  const groups = new Map();
  byChild.forEach((childRels, childId) => {
    const soft = childRels.some((r) => r.type && r.type !== 'birth');
    const parentIds = childRels.map((r) => r.a).sort();
    const key = `${parentIds.join('|')}::${soft ? 'soft' : 'birth'}`;
    if (!groups.has(key)) groups.set(key, { parentIds, soft, childIds: [], relIds: [] });
    groups.get(key).childIds.push(childId);
    groups.get(key).relIds.push(...childRels.map((r) => r.id));
  });

  const out = [];
  groups.forEach((group, key) => {
    const parentPts = group.parentIds.map((id) => positions[id]).filter(Boolean);
    const childPts = group.childIds.map((id) => positions[id]).filter(Boolean);
    if (!parentPts.length || !childPts.length) return;

    const anchorX = parentPts.reduce((sum, p) => sum + p.x, 0) / parentPts.length;
    const anchorY = Math.max(...parentPts.map((p) => p.y)) + HALF_H;
    const childTop = Math.min(...childPts.map((p) => p.y)) - HALF_H;
    const busY = Math.max(anchorY + 22, childTop - 26);

    const xs = [anchorX, ...childPts.map((p) => p.x)];
    const left = Math.min(...xs);
    const right = Math.max(...xs);

    const segments = [[anchorX, anchorY, anchorX, busY]];
    // The horizontal run is needed whenever the trunk and a child don't
    // share an X — including the single-child case, where leaving it out
    // left two disconnected verticals.
    if (right - left > 0.5) segments.push([left, busY, right, busY]);
    childPts.forEach((pt) => segments.push([pt.x, busY, pt.x, pt.y - HALF_H]));

    out.push({
      key: `parent:${key}`,
      kind: 'parent',
      style: group.soft ? LINE_STYLES.parentSoft : LINE_STYLES.parent,
      segments,
      childTops: childPts.map((pt) => ({ x: pt.x, y: pt.y - HALF_H })),
      relIds: group.relIds,
      // Dropping here means "another child for these parents".
      droppable: true,
      parentIds: group.parentIds,
      memberIds: [...group.parentIds, ...group.childIds],
    });
  });
  return out;
}

function partnerConnectors(rels, positions) {
  const out = [];
  rels.forEach((rel) => {
    if (rel.kind !== 'partner') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    const style = LINE_STYLES[partnerStyleKey(rel)] || LINE_STYLES.partner;
    out.push({
      key: `partner:${rel.id}`,
      kind: 'partner',
      style,
      segments: [[a.x, a.y, b.x, b.y]],
      marker: { kind: style.marker, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      relId: rel.id,
      // A couple with no children yet has no parent line to aim at, so the
      // line between them is the only target there is — and it is the
      // obvious one. Divorced and widowed couples count too: the link
      // ended, the children did not.
      droppable: true,
      parentIds: [rel.a, rel.b],
      memberIds: [rel.a, rel.b],
    });
  });
  return out;
}

function siblingConnectors(rels, positions) {
  const out = [];
  rels.forEach((rel) => {
    if (rel.kind !== 'sibling') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    // An arch over the top, so it never gets confused with the partner
    // line running between cards.
    const archY = Math.min(a.y, b.y) - HALF_H - 30;
    out.push({
      key: `sibling:${rel.id}`,
      kind: 'sibling',
      style: LINE_STYLES.sibling,
      arch: { ax: a.x, ay: a.y - HALF_H, bx: b.x, by: b.y - HALF_H, archY },
      // Straight runs of the arch, close enough for measuring against.
      segments: [
        [a.x, a.y - HALF_H, a.x, archY],
        [a.x, archY, b.x, archY],
        [b.x, archY, b.x, b.y - HALF_H],
      ],
      relId: rel.id,
      // Siblings are peers. There is no couple here to hang a child from,
      // so this is deliberately not a drop target.
      droppable: false,
      parentIds: [],
      memberIds: [rel.a, rel.b],
    });
  });
  return out;
}

function otherConnectors(rels, positions) {
  const out = [];
  rels.forEach((rel) => {
    if (rel.kind !== 'other') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    out.push({
      key: `other:${rel.id}`,
      kind: 'other',
      style: LINE_STYLES.other,
      segments: [[a.x, a.y, b.x, b.y]],
      label: rel.label ? { text: rel.label, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null,
      relId: rel.id,
      // "Something else" says nothing about parentage, so it cannot mean
      // "add a child" either.
      droppable: false,
      parentIds: [],
      memberIds: [rel.a, rel.b],
    });
  });
  return out;
}

// Draw order matters: parent trunks sit under everything else, exactly as
// they did when this was inline in RelationshipLines.
export function buildConnectors(relationships, positions) {
  const rels = Object.values(relationships);
  return [
    ...parentConnectors(rels, positions),
    ...partnerConnectors(rels, positions),
    ...siblingConnectors(rels, positions),
    ...otherConnectors(rels, positions),
  ];
}

// ---- Hit-testing ----

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  // Clamped, so a point beyond either end measures to the endpoint rather
  // than to the infinite line the segment happens to sit on.
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function distanceToConnector(connector, x, y) {
  return connector.segments.reduce(
    (best, segment) => Math.min(best, distanceToSegment(x, y, segment)),
    Infinity
  );
}

// The connector a card dropped at (x, y) has landed on, or null.
//
// `excludeId` is the card being dragged. A card is never counted as landing
// on a line it is itself an end of: dragging someone along their own
// partner line would otherwise light it up the whole way, and a slip of the
// hand would read as an instruction.
export function findConnectorAt(connectors, x, y, tolerance, excludeId = null) {
  const hits = [];
  connectors.forEach((connector) => {
    if (!connector.droppable) return;
    if (excludeId && connector.memberIds.includes(excludeId)) return;
    const distance = distanceToConnector(connector, x, y);
    if (distance <= tolerance) hits.push({ connector, distance });
  });
  if (!hits.length) return null;

  // Nearest wins; an exact tie falls back to the key so the same drop
  // always resolves the same way.
  hits.sort((p, q) => {
    if (p.distance !== q.distance) return p.distance - q.distance;
    if (p.connector.key < q.connector.key) return -1;
    if (p.connector.key > q.connector.key) return 1;
    return 0;
  });
  return hits[0].connector;
}
