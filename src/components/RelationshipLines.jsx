import { useMemo } from 'react';
import { Circle, Group, Line, Shape, Text } from 'react-konva';
import { buildConnectors } from '../utils/connectors';
import { EXPORT_THEMES } from '../utils/constants';

const BOARD = EXPORT_THEMES[0];
// Wide enough for a typical label ("Godmother", "Best friend"); anything
// longer ends in an ellipsis instead of being cut off mid-letter.
const LABEL_WIDTH = 180;

// --- Midpoint markers. These are the vocabulary the legend teaches. ---
function Marker({ kind, x, y, color, paper }) {
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
        // Filled with the paper colour, so the ring reads as open on any
        // export template, not as an off-white disc.
        <Circle x={x} y={y} radius={6} fill={paper} stroke={color} strokeWidth={2} listening={false} />
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
      // The trunk and bus are shared by a whole sibling set, so a click
      // there has no single link to mean; they don't listen. Each child's
      // own drop does: clicking it offers that child's parent links. The
      // whole group is still one drop target.
      return (
        <Group key={key}>
          {highlight}
          {connector.segments.map((segment, i) => (
            <Line key={`s-${i}`} points={segment} {...stroke} listening={false} />
          ))}
          {connector.childLinks.map((link) => (
            <Line
              key={`c-${link.childId}`}
              points={link.segment}
              stroke="rgba(0,0,0,0)"
              strokeWidth={style.width}
              hitStrokeWidth={16}
              onClick={(e) => onSelect?.(link.relIds, e)}
              onTap={(e) => onSelect?.(link.relIds, e)}
            />
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
          <Line points={connector.points} {...stroke} hitStrokeWidth={16} />
          <Marker {...connector.marker} color={style.color} paper={exportTheme?.background || BOARD.background} />
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
          <Text
            text={connector.label.text}
            x={connector.label.x - LABEL_WIDTH / 2}
            y={connector.label.y - 16}
            width={LABEL_WIDTH}
            wrap="none"
            ellipsis
            align="center"
            fontFamily={exportTheme?.fontFamily || BOARD.fontFamily}
            fontSize={10}
            fill="#4E6E77"
            listening={false}
          />
        )}
      </Group>
    );
  });
}
