import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import PersonNode from './PersonNode';
import RelationshipLines from './RelationshipLines';
import Tooltip from './Tooltip';
import { CARD_WIDTH, CARD_HEIGHT, OVERLAP_THRESHOLD } from '../utils/constants';

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.4;
const PAD = 140;

function overlapFraction(ax, ay, bx, by) {
  const ox =
    Math.min(ax + CARD_WIDTH / 2, bx + CARD_WIDTH / 2) -
    Math.max(ax - CARD_WIDTH / 2, bx - CARD_WIDTH / 2);
  const oy =
    Math.min(ay + CARD_HEIGHT / 2, by + CARD_HEIGHT / 2) -
    Math.max(ay - CARD_HEIGHT / 2, by - CARD_HEIGHT / 2);
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / (CARD_WIDTH * CARD_HEIGHT);
}

function distance(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function ZoomButton({ label, detail, onClick, children }) {
  return (
    <Tooltip label={label} detail={detail} placement="top">
      <button
        onClick={onClick}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-cyan-wash active:bg-cyan-soft/40"
      >
        {children}
      </button>
    </Tooltip>
  );
}

const Canvas = forwardRef(function Canvas(
  {
    people,
    relationships,
    conflicts,
    selectedIds,
    memo,
    onSelect,
    onMovePerson,
    onEditPerson,
    onPersonContextMenu,
    onCanvasContextMenu,
    onDropOverlap,
    onRelationshipClick,
    onAddFirstPerson,
    onConflictClick,
    exportTheme,
  },
  ref
) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const pinchRef = useRef(null);

  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [hoverTargetId, setHoverTargetId] = useState(null);

  useImperativeHandle(ref, () => stageRef.current, []);

  // Konva paints text to a bitmap, so it won't pick up Proxima Nova on its
  // own once the webfont lands. Force one redraw when fonts settle.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) stageRef.current?.batchDraw();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () =>
      setSize({ width: el.clientWidth || 1000, height: el.clientHeight || 700 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const positions = useMemo(() => {
    const map = {};
    Object.entries(people).forEach(([id, person]) => {
      map[id] = { x: person.position?.x ?? 0, y: person.position?.y ?? 0 };
    });
    return map;
  }, [people]);

  const bounds = useMemo(() => {
    const list = Object.values(positions);
    if (!list.length) return { minX: 0, minY: 0, maxX: 900, maxY: 600 };
    return {
      minX: Math.min(...list.map((p) => p.x)) - CARD_WIDTH / 2 - PAD,
      maxX: Math.max(...list.map((p) => p.x)) + CARD_WIDTH / 2 + PAD,
      minY: Math.min(...list.map((p) => p.y)) - CARD_HEIGHT / 2 - PAD,
      maxY: Math.max(...list.map((p) => p.y)) + CARD_HEIGHT / 2 + PAD,
    };
  }, [positions]);

  // ---- Zoom / pan ----

  const zoomAround = useCallback((factor, cx, cy) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      if (scale === v.scale) return v;
      const worldX = (cx - v.x) / v.scale;
      const worldY = (cy - v.y) / v.scale;
      return { scale, x: cx - worldX * scale, y: cy - worldY * scale };
    });
  }, []);

  const fitToContent = useCallback(() => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w <= 0 || h <= 0) return;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(size.width / w, size.height / h)));
    setView({
      scale,
      x: (size.width - w * scale) / 2 - bounds.minX * scale,
      y: (size.height - h * scale) / 2 - bounds.minY * scale,
    });
  }, [bounds, size]);

  const handleWheel = useCallback(
    (e) => {
      e.evt.preventDefault();
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;
      zoomAround(e.evt.deltaY > 0 ? 1 / 1.09 : 1.09, pointer.x, pointer.y);
    },
    [zoomAround]
  );

  // Two-finger pinch. Konva doesn't give us this for free.
  const handleTouchMove = useCallback((e) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const [t1, t2] = touches;
    const dist = distance(t1, t2);
    const box = stage.container().getBoundingClientRect();
    const centre = {
      x: (t1.clientX + t2.clientX) / 2 - box.left,
      y: (t1.clientY + t2.clientY) / 2 - box.top,
    };

    if (pinchRef.current) {
      const factor = dist / pinchRef.current.dist;
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const worldX = (centre.x - v.x) / v.scale;
        const worldY = (centre.y - v.y) / v.scale;
        return { scale, x: centre.x - worldX * scale, y: centre.y - worldY * scale };
      });
    }
    pinchRef.current = { dist };
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  // ---- Drag to connect ----

  const findOverlapTarget = useCallback(
    (draggedId, x, y) => {
      let best = null;
      let bestScore = OVERLAP_THRESHOLD;
      Object.entries(people).forEach(([id, other]) => {
        if (id === draggedId) return;
        const score = overlapFraction(x, y, other.position?.x ?? 0, other.position?.y ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = id;
        }
      });
      return best;
    },
    [people]
  );

  const handleDragMove = useCallback(
    (personId, x, y) => {
      const target = findOverlapTarget(personId, x, y);
      setHoverTargetId((prev) => (prev === target ? prev : target));
    },
    [findOverlapTarget]
  );

  const handleDragEnd = useCallback(
    (personId, x, y, node) => {
      setHoverTargetId(null);
      const target = findOverlapTarget(personId, x, y);
      if (target) {
        const origin = people[personId]?.position;
        if (origin && node) {
          node.position({ x: origin.x, y: origin.y });
          node.getLayer()?.batchDraw();
        }
        onDropOverlap(personId, target);
        return;
      }
      onMovePerson(personId, x, y);
    },
    [findOverlapTarget, people, onDropOverlap, onMovePerson]
  );

  // ---- Stage-level events ----

  const handleStageClick = useCallback(
    (e) => {
      if (e.target === e.target.getStage()) onSelect(null);
    },
    [onSelect]
  );

  const handleStageDragEnd = useCallback((e) => {
    // Card drags bubble up here too; only react to the board itself moving.
    if (e.target !== e.target.getStage()) return;
    setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  }, []);

  const handleContextMenu = useCallback(
    (e) => {
      e.evt.preventDefault();
      if (e.target !== e.target.getStage()) return;
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;
      const worldX = (pointer.x - view.x) / view.scale;
      onCanvasContextMenu(e.evt.clientX, e.evt.clientY, worldX);
    },
    [onCanvasContextMenu, view]
  );

  const isEmpty = Object.keys(people).length === 0;

  return (
    <div ref={containerRef} className="board-surface relative h-full w-full touch-none overflow-hidden">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        onDragEnd={handleStageDragEnd}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer>
          {/* Paper behind everything, so exported images aren't transparent. */}
          <Rect
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
            fill={exportTheme?.background || '#F6FAFB'}
            listening={false}
          />

          <RelationshipLines
            people={people}
            relationships={relationships}
            positions={positions}
            onSelect={onRelationshipClick}
            exportTheme={exportTheme}
          />

          {Object.entries(people).map(([id, person]) => (
            <PersonNode
              key={id}
              person={person}
              x={person.position?.x ?? 0}
              y={person.position?.y ?? 0}
              selected={selectedIds.includes(id)}
              highlighted={hoverTargetId === id}
              conflicted={Boolean(conflicts?.has?.(id))}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onClick={(personId, e) => onSelect(personId, e.evt.shiftKey || e.evt.metaKey)}
              onDblClick={onEditPerson}
              onContextMenu={(personId, e) => {
                e.evt.preventDefault();
                e.cancelBubble = true;
                onPersonContextMenu(personId, e.evt.clientX, e.evt.clientY);
              }}
              onConflictClick={onConflictClick}
              exportTheme={exportTheme}
            />
          ))}

          {memo && (
            <Text
              text={memo}
              x={bounds.minX + 28}
              y={bounds.maxY - 52}
              fontFamily={exportTheme?.fontFamily || 'Proxima Nova, proxima-nova, system-ui, sans-serif'}
              fontSize={17}
              fill={exportTheme?.memoColor || '#5B7C85'}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-xs rounded-2xl border border-hairline bg-white/90 p-6 text-center shadow-card backdrop-blur">
            <h2 className="font-display text-lg text-ink">An empty board</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-mist">
              Add someone to begin. You can link people in any order — no need to start
              from the oldest generation.
            </p>
            <button
              onClick={onAddFirstPerson}
              className="mt-4 w-full rounded-xl bg-cyan px-4 py-2.5 font-medium text-white transition-all hover:bg-cyan-deep"
            >
              Add the first person
            </button>
          </div>
        </div>
      )}

      {/* Zoom pod. Also the touch fallback for people who can't scroll-zoom. */}
      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl border border-hairline bg-white/95 p-1 shadow-card backdrop-blur">
        <ZoomButton label="Zoom out" onClick={() => zoomAround(1 / 1.2, size.width / 2, size.height / 2)}>
          <span className="text-lg leading-none">−</span>
        </ZoomButton>
        <span className="tnum w-11 select-none text-center text-xs text-mist">
          {Math.round(view.scale * 100)}%
        </span>
        <ZoomButton label="Zoom in" onClick={() => zoomAround(1.2, size.width / 2, size.height / 2)}>
          <span className="text-lg leading-none">+</span>
        </ZoomButton>
        <div className="mx-0.5 h-5 w-px bg-hairline" />
        <ZoomButton
          label="Fit everyone on screen"
          detail="Centres the whole tree in the view."
          onClick={fitToContent}
        >
          <span className="text-sm leading-none">⤢</span>
        </ZoomButton>
      </div>
    </div>
  );
});

export default Canvas;
