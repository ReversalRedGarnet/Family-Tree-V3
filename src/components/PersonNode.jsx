import { Group, Rect, Ellipse, Line, Circle, Text, Image as KonvaImage } from 'react-konva';
import { CARD_WIDTH, CARD_HEIGHT, COLOR_THEMES } from '../utils/constants';
import useHtmlImage from '../utils/useHtmlImage';

const W = CARD_WIDTH;
const H = CARD_HEIGHT;

// Deceased cards read differently from across the board: cooled-down fill,
// a full-width slate band along the bottom carrying the lifespan, and a
// desaturated portrait. No hunting for a tiny dagger glyph.
const LIVING = { fill: '#FFFFFF', title: '#103A44', sub: '#5B7C85' };
const GONE = { fill: '#EEF3F4', title: '#4A6870', sub: '#7A9299', band: '#7A9299' };

function polygonPoints(shape) {
  const hw = W / 2;
  const hh = H / 2;
  if (shape === 'diamond') return [0, -hh - 16, hw, 0, 0, hh + 16, -hw, 0];
  if (shape === 'hexagon') {
    const cut = hw * 0.32;
    return [-hw + cut, -hh, hw - cut, -hh, hw, 0, hw - cut, hh, -hw + cut, hh, -hw, 0];
  }
  return null;
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{3,4})/);
  return m ? m[1] : null;
}

export default function PersonNode({
  person,
  x,
  y,
  selected,
  highlighted,
  conflicted,
  onDragMove,
  onDragEnd,
  onClick,
  onDblClick,
  onContextMenu,
}) {
  const theme = COLOR_THEMES.find((c) => c.id === person.colorTheme)?.hex || '#0EA5B7';
  const image = useHtmlImage(person.photo);
  const points = polygonPoints(person.shape);
  const gone = person.living === false;
  const tone = gone ? GONE : LIVING;

  const name = `${person.firstName || 'Unnamed'} ${person.lastName || ''}`.trim();
  const birth = yearOf(person.birthDate);
  const death = yearOf(person.deathDate);
  const lifespan = gone
    ? `${birth || '?'} – ${death || '?'}`
    : birth
      ? `b. ${birth}`
      : '';

  const stroke = highlighted ? '#0EA5B7' : selected ? '#0B6E7C' : gone ? '#C3D3D7' : theme;
  const shapeProps = {
    fill: tone.fill,
    stroke,
    strokeWidth: highlighted ? 3.5 : selected ? 3 : 1.75,
    shadowColor: highlighted ? 'rgba(14,165,183,0.45)' : 'rgba(16,58,68,0.18)',
    shadowBlur: highlighted ? 18 : 10,
    shadowOffsetY: 3,
    shadowOpacity: gone ? 0.5 : 1,
  };

  const hasPhoto = Boolean(image);
  const bandHeight = 18;

  return (
    <Group
      x={x}
      y={y}
      draggable
      opacity={gone ? 0.94 : 1}
      onDragMove={(e) => onDragMove(person.id, e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(person.id, e.target.x(), e.target.y(), e.target)}
      onClick={(e) => onClick(person.id, e)}
      onTap={(e) => onClick(person.id, e)}
      onDblClick={() => onDblClick(person.id)}
      onDblTap={() => onDblClick(person.id)}
      onContextMenu={(e) => onContextMenu(person.id, e)}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
    >
      {person.shape === 'circle' ? (
        <Ellipse radiusX={W / 2} radiusY={H / 2} {...shapeProps} />
      ) : points ? (
        <Line points={points} closed {...shapeProps} />
      ) : (
        <Rect
          x={-W / 2}
          y={-H / 2}
          width={W}
          height={H}
          cornerRadius={person.shape === 'rounded' ? 16 : 3}
          {...shapeProps}
        />
      )}

      {/* Colour tab: a small stripe of the person's theme along the top. */}
      {person.shape !== 'circle' && !points && (
        <Rect
          x={-W / 2 + 14}
          y={-H / 2 - 1}
          width={W - 28}
          height={3}
          cornerRadius={2}
          fill={gone ? '#C3D3D7' : theme}
          listening={false}
        />
      )}

      {hasPhoto && (
        <Group clipFunc={(ctx) => ctx.arc(-W / 2 + 26, 0, 17, 0, Math.PI * 2, false)}>
          <KonvaImage
            image={image}
            x={-W / 2 + 9}
            y={-17}
            width={34}
            height={34}
            opacity={gone ? 0.55 : 1}
          />
        </Group>
      )}

      <Text
        text={name}
        x={hasPhoto ? -W / 2 + 50 : -W / 2 + 12}
        y={lifespan ? -14 : -7}
        width={hasPhoto ? W - 62 : W - 24}
        align={hasPhoto ? 'left' : 'center'}
        fontFamily="Inter"
        fontStyle="600"
        fontSize={13.5}
        lineHeight={1.15}
        fill={tone.title}
        wrap="word"
        ellipsis
      />

      {lifespan && !gone && (
        <Text
          text={lifespan}
          x={hasPhoto ? -W / 2 + 50 : -W / 2 + 12}
          y={12}
          width={hasPhoto ? W - 62 : W - 24}
          align={hasPhoto ? 'left' : 'center'}
          fontFamily="JetBrains Mono"
          fontSize={10}
          fill={tone.sub}
        />
      )}

      {/* Memorial band. Only deceased cards carry one, so a full row of
          cards can be scanned for it without reading a single name. */}
      {gone && (
        <Group listening={false}>
          <Rect
            x={-W / 2}
            y={H / 2 - bandHeight}
            width={W}
            height={bandHeight}
            cornerRadius={person.shape === 'rounded' ? [0, 0, 16, 16] : [0, 0, 3, 3]}
            fill={GONE.band}
          />
          <Text
            text={`✝  ${lifespan}`}
            x={-W / 2}
            y={H / 2 - bandHeight + 4.5}
            width={W}
            align="center"
            fontFamily="JetBrains Mono"
            fontSize={10}
            fill="#FFFFFF"
          />
        </Group>
      )}

      {conflicted && (
        <Group x={W / 2 - 12} y={-H / 2 + 4} listening={false}>
          <Circle radius={9} fill="#E86A6A" />
          <Text text="!" x={-2.5} y={-6} fontSize={12} fontStyle="bold" fill="#FFFFFF" />
        </Group>
      )}
    </Group>
  );
}
