import { Group, Ellipse, Rect, Circle, Text } from 'react-konva';
import { CARD_WIDTH, CARD_HEIGHT, COLOR_THEMES, shapeForGender } from '../utils/constants';
import { formatLifespan } from '../utils/dates';

const W = CARD_WIDTH;
const H = CARD_HEIGHT;
const FONT = 'Proxima Nova, proxima-nova, system-ui, sans-serif';

const HALF_W = W / 2;
const HALF_H = H / 2;

const LIVING = { fill: '#FFFFFF', title: '#103A44', sub: '#5B7C85' };
const GONE = { fill: '#EEF3F4', title: '#4A6870', sub: '#7A9299', band: '#7A9299' };

const BAND_HEIGHT = 20;

// Clipping the memorial band to the card silhouette means one treatment
// works for both shapes: a straight edge on a rectangle, a chord on a circle.
function clipToShape(shape) {
  if (shape === 'circle') {
    return (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, HALF_W, HALF_H, 0, 0, Math.PI * 2);
      ctx.closePath();
    };
  }
  return (ctx) => {
    ctx.beginPath();
    ctx.rect(-HALF_W, -HALF_H, W, H);
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
  onConflictClick,
  exportTheme, // only ever set during export capture — see App.jsx
}) {
  const shape = shapeForGender(person.gender);
  const isCircle = shape === 'circle';
  const theme = COLOR_THEMES.find((c) => c.id === person.colorTheme)?.hex || '#0EA5B7';
  const gone = person.living === false;
  // A template restyles the paper and ink, never a person's own chosen
  // accent colour — that's their distinguishing detail, not the template's.
  const fontFamily = exportTheme?.fontFamily || FONT;
  const livingTone = exportTheme?.card?.living || LIVING;
  const goneTone = exportTheme?.card?.gone || GONE;
  const tone = gone ? goneTone : livingTone;

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

  // Both shapes are full-bleed (neither tapers like the old triangle did),
  // so they share the same text metrics.
  const nameY = lifespan ? -16 : -8;
  const nameWidth = W - 36;
  const lifespanY = 4;
  const lifespanWidth = W - 36;

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
        <Ellipse radiusX={HALF_W} radiusY={HALF_H} {...shapeProps} />
      ) : (
        <Rect x={-HALF_W} y={-HALF_H} width={W} height={H} {...shapeProps} />
      )}

      <Text
        text={name}
        x={-nameWidth / 2}
        y={nameY}
        width={nameWidth}
        align="center"
        fontFamily={fontFamily}
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
          fontFamily={fontFamily}
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
            x={-HALF_W}
            y={HALF_H - BAND_HEIGHT}
            width={HALF_W * 2}
            height={BAND_HEIGHT}
            fill={goneTone.band}
          />
          <Text
            text={lifespan ? `✝  ${lifespan}` : '✝'}
            x={-HALF_W}
            y={HALF_H - BAND_HEIGHT + (isCircle ? 3.5 : 5)}
            width={HALF_W * 2}
            align="center"
            fontFamily={fontFamily}
            fontSize={10.5}
            fill="#FFFFFF"
          />
        </Group>
      )}

      {conflicted && (
        <Group
          x={HALF_W - 14}
          y={-HALF_H + 6}
          onClick={(e) => {
            e.cancelBubble = true;
            onConflictClick?.(person.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onConflictClick?.(person.id);
          }}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'help';
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'grab';
          }}
        >
          <Circle radius={9} fill="#E86A6A" />
          <Text text="!" x={-2.5} y={-6} fontSize={12} fontStyle="bold" fill="#FFFFFF" />
        </Group>
      )}
    </Group>
  );
}
