import { Fragment, useMemo } from 'react';
import { Circle, Group, Line, Shape, Text } from 'react-konva';
import { buildConnectors } from '../utils/connectors';

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

// The glow shown while a card is hovering over a line during a drag, so it
// is obvious which link is about to catch the drop. Drawn from the very
// segments the hit test measures against, so what lights up is exactly what
// would be hit.
function DropHighlight({ connector }) {
  return (
    <Group listening={false}>
      {connector.segments.map((segment, i) => (
        <Line
          key={`hl-${i}`}
          points={segment}
          stroke={connector.style.color}
          strokeWidth={connector.style.width + 13}
          opacity={0.26}
          lineCap="round"
          lineJoin="round"
        />
      ))}
    </Group>
  );
}

export default function RelationshipLines({
  relationships,
  positions,
  onSelect,
  highlightKey = null,
  exportTheme,
}) {
  // Geometry lives in utils/connectors so the hit test and the drawing can
  // never disagree about where a line actually is.
  const connectors = useMemo(
    () => buildConnectors(relationships, positions),
    [relationships, positions]
  );

  return connectors.map((connector) => {
    const { key, style } = connector;
    const highlight = highlightKey === key ? <DropHighlight connector={connector} /> : null;

    const stroke = {
      stroke: style.color,
      strokeWidth: style.width,
      dash: style.dash || undefined,
      lineCap: 'round',
      lineJoin: 'round',
    };

    if (connector.kind === 'parent') {
      // Not clickable: a parent line is shared by a whole sibling set, so
      // there is no single link for a click to mean. It is still a drop
      // target — that reads the group as a whole, which is exactly right.
      return (
        <Group key={key}>
          {highlight}
          {connector.segments.map((segment, i) => (
            <Line key={`s-${i}`} points={segment} {...stroke} listening={false} />
          ))}
          {connector.childTops.map((pt, i) => (
            <Circle key={`d-${i}`} x={pt.x} y={pt.y} radius={2.6} fill={style.color} listening={false} />
          ))}
        </Group>
      );
    }

    if (connector.kind === 'partner') {
      return (
        <Group
          key={key}
          onClick={(e) => onSelect?.(connector.relId, e)}
          onTap={(e) => onSelect?.(connector.relId, e)}
        >
          {highlight}
          <Line points={connector.segments[0]} {...stroke} hitStrokeWidth={16} />
          <Marker {...connector.marker} color={style.color} />
        </Group>
      );
    }

    if (connector.kind === 'sibling') {
      const { ax, ay, bx, by, archY } = connector.arch;
      return (
        <Group
          key={key}
          onClick={(e) => onSelect?.(connector.relId, e)}
          onTap={(e) => onSelect?.(connector.relId, e)}
        >
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(ax, archY + 10);
              ctx.quadraticCurveTo(ax, archY, ax + (bx > ax ? 12 : -12), archY);
              ctx.lineTo(bx + (bx > ax ? -12 : 12), archY);
              ctx.quadraticCurveTo(bx, archY, bx, archY + 10);
              ctx.lineTo(bx, by);
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
    }

    return (
      <Group
        key={key}
        onClick={(e) => onSelect?.(connector.relId, e)}
        onTap={(e) => onSelect?.(connector.relId, e)}
      >
        <Line points={connector.segments[0]} {...stroke} hitStrokeWidth={16} />
        {connector.label && (
          <Fragment>
            <Text
              text={connector.label.text}
              x={connector.label.x - 60}
              y={connector.label.y - 16}
              width={120}
              align="center"
              fontFamily={exportTheme?.fontFamily || 'Inter'}
              fontSize={10}
              fill="#5B7C85"
              listening={false}
            />
          </Fragment>
        )}
      </Group>
    );
  });
}
