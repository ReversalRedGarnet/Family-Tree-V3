import { Fragment, useMemo } from 'react';
import { Circle, Group, Line, Shape, Text } from 'react-konva';
import { CARD_HEIGHT, LINE_STYLES } from '../utils/constants';

const HALF_H = CARD_HEIGHT / 2;

// Which visual style a partner link gets: status wins over type, because
// "divorced" is the more important fact than "was a marriage".
function partnerStyleKey(rel) {
  if (rel.status && rel.status !== 'together') return rel.status;
  return rel.type || 'partner';
}

// --- Midpoint markers. These are the vocabulary the legend teaches. ---
function Marker({ kind, x, y, color }) {
  switch (kind) {
    case 'ring-filled':
      return (
        <Group listening={false}>
          <Circle x={x} y={y} radius={6.5} fill={color} />
          <Circle x={x} y={y} radius={2.4} fill="#FFFFFF" />
        </Group>
      );
    case 'ring-open':
      return (
        <Circle x={x} y={y} radius={6} fill="#F6FAFB" stroke={color} strokeWidth={2} listening={false} />
      );
    case 'dot':
      return <Circle x={x} y={y} radius={3.5} fill={color} listening={false} />;
    case 'break':
      // Two slashes cutting the line — the classic genealogical divorce mark.
      return (
        <Group listening={false}>
          <Line points={[x - 6, y + 7, x - 1, y - 7]} stroke={color} strokeWidth={2} lineCap="round" />
          <Line points={[x + 1, y + 7, x + 6, y - 7]} stroke={color} strokeWidth={2} lineCap="round" />
        </Group>
      );
    default:
      return null;
  }
}

export default function RelationshipLines({ people, relationships, positions, onSelect, exportTheme }) {
  const rels = useMemo(() => Object.values(relationships), [relationships]);

  // ---- Parent links, grouped into a shared drop so a couple's children
  // hang from one trunk instead of a fan of crossing diagonals. ----
  const parentGroups = useMemo(() => {
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
    return [...groups.values()];
  }, [rels, positions]);

  const elements = [];

  parentGroups.forEach((group, i) => {
    const parentPts = group.parentIds.map((id) => positions[id]).filter(Boolean);
    const childPts = group.childIds.map((id) => positions[id]).filter(Boolean);
    if (!parentPts.length || !childPts.length) return;

    const style = group.soft ? LINE_STYLES.parentSoft : LINE_STYLES.parent;
    const anchorX = parentPts.reduce((sum, p) => sum + p.x, 0) / parentPts.length;
    const anchorY = Math.max(...parentPts.map((p) => p.y)) + HALF_H;
    const childTop = Math.min(...childPts.map((p) => p.y)) - HALF_H;
    const busY = Math.max(anchorY + 22, childTop - 26);

    const xs = [anchorX, ...childPts.map((p) => p.x)];
    const common = {
      stroke: style.color,
      strokeWidth: style.width,
      dash: style.dash || undefined,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    };

    const left = Math.min(...xs);
    const right = Math.max(...xs);

    elements.push(
      <Group key={`pg-${i}`}>
        {/* trunk down from the parent(s) */}
        <Line points={[anchorX, anchorY, anchorX, busY]} {...common} />
        {/* The horizontal run. Needed whenever the trunk and a child don't
            share an X — including the single-child case, where leaving it
            out left two disconnected verticals. */}
        {right - left > 0.5 && <Line points={[left, busY, right, busY]} {...common} />}
        {/* a drop to each child */}
        {childPts.map((pt, ci) => (
          <Fragment key={`pg-${i}-c-${ci}`}>
            <Line points={[pt.x, busY, pt.x, pt.y - HALF_H]} {...common} />
            <Circle x={pt.x} y={pt.y - HALF_H} radius={2.6} fill={style.color} listening={false} />
          </Fragment>
        ))}
      </Group>
    );
  });

  // ---- Partner links ----
  rels.forEach((rel) => {
    if (rel.kind !== 'partner') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    const style = LINE_STYLES[partnerStyleKey(rel)] || LINE_STYLES.partner;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    elements.push(
      <Group key={`p-${rel.id}`} onClick={(e) => onSelect?.(rel.id, e)} onTap={(e) => onSelect?.(rel.id, e)}>
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke={style.color}
          strokeWidth={style.width}
          dash={style.dash || undefined}
          lineCap="round"
          hitStrokeWidth={16}
        />
        <Marker kind={style.marker} x={midX} y={midY} color={style.color} />
      </Group>
    );
  });

  // ---- Explicit sibling links: an arch over the top, so it never gets
  // confused with the partner line running between cards. ----
  rels.forEach((rel) => {
    if (rel.kind !== 'sibling') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    const style = LINE_STYLES.sibling;
    const archY = Math.min(a.y, b.y) - HALF_H - 30;

    elements.push(
      <Group key={`s-${rel.id}`} onClick={(e) => onSelect?.(rel.id, e)} onTap={(e) => onSelect?.(rel.id, e)}>
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - HALF_H);
            ctx.lineTo(a.x, archY + 10);
            ctx.quadraticCurveTo(a.x, archY, a.x + (b.x > a.x ? 12 : -12), archY);
            ctx.lineTo(b.x + (b.x > a.x ? -12 : 12), archY);
            ctx.quadraticCurveTo(b.x, archY, b.x, archY + 10);
            ctx.lineTo(b.x, b.y - HALF_H);
            ctx.strokeShape(shape);
          }}
          stroke={style.color}
          strokeWidth={style.width}
          dash={style.dash}
          lineCap="round"
          hitStrokeWidth={16}
        />
      </Group>
    );
  });

  // ---- Anything else the user wanted to record ----
  rels.forEach((rel) => {
    if (rel.kind !== 'other') return;
    const a = positions[rel.a];
    const b = positions[rel.b];
    if (!a || !b) return;

    const style = LINE_STYLES.other;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    elements.push(
      <Group key={`o-${rel.id}`} onClick={(e) => onSelect?.(rel.id, e)} onTap={(e) => onSelect?.(rel.id, e)}>
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke={style.color}
          strokeWidth={style.width}
          dash={style.dash}
          lineCap="round"
          hitStrokeWidth={16}
        />
        {rel.label && (
          <Text
            text={rel.label}
            x={midX - 60}
            y={midY - 16}
            width={120}
            align="center"
            fontFamily={exportTheme?.fontFamily || 'Inter'}
            fontSize={10}
            fill="#5B7C85"
            listening={false}
          />
        )}
      </Group>
    );
  });

  return elements;
}
