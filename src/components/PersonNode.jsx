import { Group, Ellipse, Line, Rect, Circle, Text } from 'react-konva';
import { CARD_WIDTH, CARD_HEIGHT, COLOR_THEMES, shapeForGender } from '../utils/constants';
import { formatLifespan } from '../utils/dates';

const W = CARD_WIDTH;
const H = CARD_HEIGHT;
const FONT = 'Proxima Nova, proxima-nova, system-ui, sans-serif';

// The triangle is drawn slightly larger than the nominal card box so its
// lower half is wide enough to hold a name.
const APEX_Y = -H / 2 - 18;
const BASE_Y = H / 2;
const BASE_HALF = W / 2 + 10;
const TRIANGLE = [0, APEX_Y, BASE_HALF, BASE_Y, -BASE_HALF, BASE_Y];

const LIVING = { fill: '#FFFFFF', title: '#103A44', sub: '#5B7C85' };
const GONE = { fill: '#EEF3F4', title: '#4A6870', sub: '#7A9299', band: '#7A9299' };

const BAND_HEIGHT = 20;

// Clipping the memorial band to the card silhouette means one treatment
// works for both shapes: a trapezoid on a triangle, a chord on a circle.
function clipToShape(shape) {
  if (shape === 'circle') {
    return (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, W / 2, H / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
    };
  }
  return (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, APEX_Y);
    ctx.lineTo(BASE_HALF, BASE_Y);
    ctx.lineTo(-BASE_HALF, BASE_Y);
    ctx.closePath();
  };
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
  const shape = shapeForGender(person.gender);
  const isCircle = shape === 'circle';
  const theme = COLOR_THEMES.find((c) => c.id === person.colorTheme)?.hex || '#0EA5B7';
  const gone = person.living === false;
  const tone = gone ? GONE : LIVING;

  const name = `${person.firstName || 'Unnamed'} ${person.lastName || ''}`.trim();
  const lifespan = formatLifespan(person);

  const stroke = highlighted ? '#0EA5B7' : selected ? '#0B6E7C' : gone ? '#C3D3D7' : theme;
  const shapeProps = {
    fill: tone.fill,
    stroke,
    strokeWidth: highlighted ? 3.5 : selected ? 3 : 2,
    shadowColor: highlighted ? 'rgba(14,165,183,0.45)' : 'rgba(16,58,68,0.18)',
    shadowBlur: highlighted ? 18 : 10,
    shadowOffsetY: 3,
    shadowOpacity: gone ? 0.5 : 1,
    lineJoin: 'round',
  };

  // A triangle narrows toward the apex, so its text sits lower and reads
  // across a shorter measure than a circle's does.
  const nameY = isCircle ? (lifespan ? -16 : -8) : -8;
  const nameWidth = isCircle ? W - 36 : 96;
  const lifespanY = isCircle ? 4 : 12;
  const lifespanWidth = isCircle ? W - 36 : 116;

  return (
    <Group
      x={x}
      y={y}
      draggable
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
      {isCircle ? (
        <Ellipse radiusX={W / 2} radiusY={H / 2} {...shapeProps} />
      ) : (
        <Line points={TRIANGLE} closed {...shapeProps} />
      )}

      <Text
        text={name}
        x={-nameWidth / 2}
        y={nameY}
        width={nameWidth}
        align="center"
        fontFamily={FONT}
        fontStyle="600"
        fontSize={13.5}
        lineHeight={1.15}
        fill={tone.title}
        wrap="word"
        ellipsis
        listening={false}
      />

      {lifespan && !gone && (
        <Text
          text={lifespan}
          x={-lifespanWidth / 2}
          y={lifespanY}
          width={lifespanWidth}
          align="center"
          fontFamily={FONT}
          fontSize={10.5}
          fill={tone.sub}
          listening={false}
        />
      )}

      {/* Deceased cards carry a grey band along the base, clipped to the
          card's own outline. Scannable across a whole row without reading
          a single name. */}
      {gone && (
        <Group clipFunc={clipToShape(shape)} listening={false}>
          <Rect
            x={-BASE_HALF}
            y={BASE_Y - BAND_HEIGHT}
            width={BASE_HALF * 2}
            height={BAND_HEIGHT}
            fill={GONE.band}
          />
          <Text
            text={lifespan ? `✝  ${lifespan}` : '✝'}
            x={-BASE_HALF}
            y={BASE_Y - BAND_HEIGHT + (isCircle ? 3.5 : 5)}
            width={BASE_HALF * 2}
            align="center"
            fontFamily={FONT}
            fontSize={10.5}
            fill="#FFFFFF"
          />
        </Group>
      )}

      {conflicted && (
        <Group x={isCircle ? W / 2 - 14 : BASE_HALF - 22} y={-H / 2 + 6} listening={false}>
          <Circle radius={9} fill="#E86A6A" />
          <Text text="!" x={-2.5} y={-6} fontSize={12} fontStyle="bold" fill="#FFFFFF" />
        </Group>
      )}
    </Group>
  );
}
