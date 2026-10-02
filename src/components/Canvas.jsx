import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Stage, Layer, Rect, Ellipse, Text } from 'react-konva';
import PersonNode from './PersonNode';
import RelationshipLines from './RelationshipLines';
import Tooltip from './Tooltip';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  OVERLAP_THRESHOLD,
  LINE_DROP_TOLERANCE,
  TOUCH_LINE_DROP_TOLERANCE,
  TOUCH_OVERLAP_THRESHOLD,
  BOARD_PADDING,
  ZOOM_BUTTON_STEP,
  MARQUEE_THRESHOLD,
  shapeForGender,
} from '../utils/constants';
import { buildConnectors, findConnectorAt } from '../utils/connectors';
import { formatName } from '../utils/names';
import { clampScale, fitScale, minScaleFor, wheelAction } from '../utils/viewport';
import {
  boardKeyCommand,
  describePerson,
  nextCurrent,
  revealView,
  startingPerson,
} from '../utils/boardNav';
import { createLongPress } from '../utils/longPress';

// A touch-originated drag needs the wider, touch-tuned tolerances; a
// mouse-originated one keeps the tighter mouse ones. Checked once, at the
// moment a drag actually starts — not per pointer-move — since Konva
// occasionally reports a mouse-shaped event mid-touch-drag on some
// browsers, and re-checking every move could flip a single gesture between
// the two rule sets partway through.
function isTouchEvent(nativeEvt) {
  if (!nativeEvt) return false;
  if (nativeEvt.pointerType) return nativeEvt.pointerType === 'touch' || nativeEvt.pointerType === 'pen';
  return typeof nativeEvt.type === 'string' && nativeEvt.type.startsWith('touch');
}

function nameOf(people, id) {
  const p = people[id];
  if (!p) return null;
  return formatName(p);
}

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

// The tap that ends a long-press isn't a tap: the menu it opened is the
// whole answer, so it doesn't also change the selection.
function endsLongPress(e, longPress) {
  return isTouchEvent(e.evt) && longPress.fired;
}

// The person whose card `node` belongs to (the card itself or anything
// drawn inside it), or null for the board, a line, or anything else.
function personIdOf(node, nodeRefs) {
  for (let n = node; n; n = n.getParent?.()) {
    const id = Object.keys(nodeRefs).find((key) => nodeRefs[key] === n);
    if (id) return id;
  }
  return null;
}

// Read out by screen readers when the board takes focus.
const BOARD_KEYS_HELP =
  'Arrow keys move between people and select them; Shift with an arrow adds to the selection. ' +
  'Space selects or deselects. Enter edits. Shift+F10 or the Menu key opens the menu. ' +
  'Delete removes the selection.';

// The dashed ring round the keyboard's current person, this far outside
// the card's own outline.
const RING_GAP = 7;

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
    onSelectMany,
    onMovePerson,
    onMoveMany,
    onEditPerson,
    onPersonContextMenu,
    onCanvasContextMenu,
    onDropOverlap,
    onDropOnConnector,
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
  // Every rendered card's underlying Konva node, keyed by person id — so a
  // multi-selection drag can move the OTHER selected cards directly during
  // the gesture (see handleDragMove/handleDragEnd) without going through
  // React state on every pointer move.
  const nodeRefs = useRef({});
  // One ref-callback per person id, created once and reused forever rather
  // than fresh on every render — PersonNode is memoized (see
  // personPropsAreEqual there), and a `registerRef` that changed identity
  // every render would defeat that for every single card on every render,
  // exactly the same way the inline onClick/onContextMenu closures below
  // used to.
  const registerRefCache = useRef(new Map());
  const getRegisterRef = useCallback((id) => {
    let fn = registerRefCache.current.get(id);
    if (!fn) {
      fn = (node) => {
        if (node) nodeRefs.current[id] = node;
        else delete nodeRefs.current[id];
      };
      registerRefCache.current.set(id, fn);
    }
    return fn;
  }, []);
  // Mouse-only pan (middle-button, or space+left-button, on empty canvas)
  // and touch pan (single finger) both go through this: the client point
  // and view offset the gesture started from. Konva's own `draggable` used
  // to do this for us, but plain left-drag on empty canvas is now the
  // marquee gesture below, so panning is done by hand instead.
  const panRef = useRef(null);
  // A candidate marquee: set on mousedown over empty canvas, promoted to an
  // actual visible rectangle (marqueeRect state) only once the pointer has
  // moved past a small threshold — so a plain click still reads as a click.
  const marqueeStartRef = useRef(null);
  const marqueeActiveRef = useRef(false);
  const marqueeRectRef = useRef(null);
  // Set for the duration of a drag that moves a whole multi-selection: the
  // card actually being dragged, its position when the drag started, and
  // the same for every other selected card, so the group can be shifted by
  // exactly the anchor's own delta and committed as one move.
  const groupDragRef = useRef(null);
  const spaceRef = useRef(false);

  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [hoverTargetId, setHoverTargetId] = useState(null);
  const [hoverConnectorKey, setHoverConnectorKey] = useState(null);
  const [touchDrag, setTouchDrag] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Keyboard: the person the keys act on, and whether the keyboard is in
  // use right now. The ring is only drawn while it is, so a mouse user
  // never sees it.
  const [currentId, setCurrentId] = useState(null);
  const [keyboardActive, setKeyboardActive] = useState(false);

  useImperativeHandle(ref, () => stageRef.current, []);

  // `view` read from inside stable (empty-deps) window-level listeners
  // below — a ref mirror avoids those closing over a stale value.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Holding Space pans by dragging with the primary mouse button — the
  // usual escape hatch (Figma, Miro, Photoshop) now that plain left-drag on
  // empty canvas draws a marquee instead of panning the board.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

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
      minX: Math.min(...list.map((p) => p.x)) - CARD_WIDTH / 2 - BOARD_PADDING,
      maxX: Math.max(...list.map((p) => p.x)) + CARD_WIDTH / 2 + BOARD_PADDING,
      minY: Math.min(...list.map((p) => p.y)) - CARD_HEIGHT / 2 - BOARD_PADDING,
      maxY: Math.max(...list.map((p) => p.y)) + CARD_HEIGHT / 2 + BOARD_PADDING,
    };
  }, [positions]);

  // ---- Zoom / pan ----

  const minScale = useMemo(() => minScaleFor(bounds, size), [bounds, size]);
  // Read through a ref so zoomAround keeps one identity across renders.
  const minScaleRef = useRef(minScale);
  minScaleRef.current = minScale;

  const zoomAround = useCallback((factor, cx, cy) => {
    setView((v) => {
      const scale = clampScale(v.scale * factor, minScaleRef.current);
      if (scale === v.scale) return v;
      const worldX = (cx - v.x) / v.scale;
      const worldY = (cy - v.y) / v.scale;
      return { scale, x: cx - worldX * scale, y: cy - worldY * scale };
    });
  }, []);

  const fitToContent = useCallback(() => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const fit = fitScale(bounds, size);
    if (fit === null) return;
    const scale = clampScale(fit, minScale);
    setView({
      scale,
      x: (size.width - w * scale) / 2 - bounds.minX * scale,
      y: (size.height - h * scale) / 2 - bounds.minY * scale,
    });
  }, [bounds, size, minScale]);

  const handleWheel = useCallback(
    (e) => {
      e.evt.preventDefault();
      const action = wheelAction(e.evt);
      if (!action) return;
      if (action.type === 'pan') {
        setView((v) => ({ ...v, x: v.x + action.dx, y: v.y + action.dy }));
        return;
      }
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;
      zoomAround(action.factor, pointer.x, pointer.y);
    },
    [zoomAround]
  );

  // ---- Touch: long-press opens the menu ----
  //
  // A held finger on a card or on the empty board opens the same menu a
  // right-click does. Read through a ref so the long-press controller,
  // created once, always calls the current handlers.
  const menuHandlersRef = useRef({ onPersonContextMenu, onCanvasContextMenu });
  menuHandlersRef.current = { onPersonContextMenu, onCanvasContextMenu };
  // When a hold opened the menu, so Android's own long-press `contextmenu`
  // arriving just after doesn't open it a second time.
  const lastLongPressAtRef = useRef(0);
  // The card a hold landed on stops being draggable until the finger
  // lifts, so drifting off the menu doesn't drag the card too.
  const heldCardRef = useRef(null);

  const holdStill = useCallback((personId) => {
    // The gesture stops panning, keeping wherever the board had got to.
    const stage = stageRef.current;
    if (panRef.current && stage) setView((v) => ({ ...v, x: stage.x(), y: stage.y() }));
    panRef.current = null;
    const node = personId ? nodeRefs.current[personId] : null;
    if (node) {
      node.draggable(false);
      heldCardRef.current = node;
    }
  }, []);

  const releaseHeldCard = useCallback(() => {
    heldCardRef.current?.draggable(true);
    heldCardRef.current = null;
  }, []);

  const longPressRef = useRef(null);
  if (!longPressRef.current) {
    longPressRef.current = createLongPress({
      onFire: ({ x, y, detail }) => {
        lastLongPressAtRef.current = Date.now();
        holdStill(detail.personId);
        const { onPersonContextMenu: personMenu, onCanvasContextMenu: boardMenu } = menuHandlersRef.current;
        if (detail.personId) personMenu(detail.personId, x, y);
        else boardMenu(x, y, detail.worldX);
      },
    });
  }
  useEffect(() => () => longPressRef.current?.cancel(), []);

  // Touch panning and pinch-zoom used to ride on Konva's own `draggable`
  // Stage, but that also has to be off now (plain left-drag on empty canvas
  // is the marquee gesture, mouse-side — see below), so both are done by
  // hand here. A single finger on empty canvas pans; a second finger
  // arriving kills that pan outright (stopDrag alone isn't enough once the
  // Stage isn't Konva-draggable any more, but panRef itself needs clearing
  // too, or the dropped-to-one-finger branch below would think a pan was
  // already in flight) and starts a pinch instead, so the two gestures
  // never fight over the same touch's movement.
  const handleTouchStart = useCallback(
    (e) => {
      const touches = e.evt.touches;
      const longPress = longPressRef.current;
      if (touches.length >= 2) {
        longPress.cancel();
        panRef.current = null;
        const [t1, t2] = touches;
        pinchRef.current = { dist: distance(t1, t2) };
        return;
      }
      if (touches.length !== 1) return;
      const t = touches[0];
      releaseHeldCard();
      const onBoard = e.target === e.target.getStage();
      const personId = onBoard ? null : personIdOf(e.target, nodeRefs.current);
      if (personId) {
        longPress.start(t.clientX, t.clientY, { personId });
      } else if (onBoard) {
        const box = stageRef.current?.container().getBoundingClientRect();
        const v = viewRef.current;
        const worldX = box ? (t.clientX - box.left - v.x) / v.scale : 0;
        longPress.start(t.clientX, t.clientY, { worldX });
      } else {
        // A line has its own tap menu; a hold there is nothing special.
        longPress.cancel();
      }
      if (onBoard) {
        panRef.current = {
          startClientX: t.clientX,
          startClientY: t.clientY,
          startX: viewRef.current.x,
          startY: viewRef.current.y,
        };
      }
    },
    [releaseHeldCard]
  );

  const handleTouchMove = useCallback(
    (e) => {
      const touches = e.evt.touches;

      if (touches.length >= 2) {
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
        // The same clamp-and-recentre math as a wheel zoom or the +/-
        // buttons — pinch is just another way of asking for it, centred on
        // the midpoint between the two fingers instead of the cursor.
        if (pinchRef.current) zoomAround(dist / pinchRef.current.dist, centre.x, centre.y);
        pinchRef.current = { dist };
        return;
      }

      if (touches.length === 1) longPressRef.current.move(touches[0].clientX, touches[0].clientY);

      if (touches.length === 1 && panRef.current) {
        e.evt.preventDefault();
        const t = touches[0];
        const stage = stageRef.current;
        if (!stage) return;
        stage.x(panRef.current.startX + (t.clientX - panRef.current.startClientX));
        stage.y(panRef.current.startY + (t.clientY - panRef.current.startClientY));
        stage.batchDraw();
      }
    },
    [zoomAround]
  );

  const handleTouchEnd = useCallback((e) => {
    const remaining = e.evt.touches;
    const longPress = longPressRef.current;
    longPress.cancel();
    // After a hold opened the menu, lifting the finger is the end of that
    // gesture, not a tap: no click or mouse events follow it (on iOS those
    // would land on the board and close the menu straight away).
    if (longPress.fired && e.evt.cancelable) e.evt.preventDefault();

    if (remaining.length === 0) {
      releaseHeldCard();
      pinchRef.current = null;
      const stage = stageRef.current;
      if (panRef.current && stage) setView((v) => ({ ...v, x: stage.x(), y: stage.y() }));
      panRef.current = null;
      return;
    }

    if (remaining.length === 1) {
      // Down from two fingers to one: hand off from pinch to a fresh
      // single-finger pan anchored at whichever finger is left, so panning
      // carries on without a jump instead of just stopping.
      pinchRef.current = null;
      const stage = stageRef.current;
      const t = remaining[0];
      panRef.current = {
        startClientX: t.clientX,
        startClientY: t.clientY,
        startX: stage ? stage.x() : viewRef.current.x,
        startY: stage ? stage.y() : viewRef.current.y,
      };
    }
  }, [releaseHeldCard]);

  // ---- Mouse: pan (middle-button or space+drag) and marquee select ----

  const handlePanMouseMove = useCallback((e) => {
    const pan = panRef.current;
    const stage = stageRef.current;
    if (!pan || !stage) return;
    stage.x(pan.startX + (e.clientX - pan.startClientX));
    stage.y(pan.startY + (e.clientY - pan.startClientY));
    stage.batchDraw();
  }, []);

  const handlePanMouseUp = useCallback((e) => {
    const pan = panRef.current;
    panRef.current = null;
    window.removeEventListener('mousemove', handlePanMouseMove);
    window.removeEventListener('mouseup', handlePanMouseUp);
    if (!pan) return;
    setView((v) => ({
      ...v,
      x: pan.startX + (e.clientX - pan.startClientX),
      y: pan.startY + (e.clientY - pan.startClientY),
    }));
  }, [handlePanMouseMove]);

  // Below MARQUEE_THRESHOLD of movement, a mousedown on the empty board
  // reads as a plain click (which Konva's own click handling already treats
  // as "deselect everyone", the same as it always has).

  const finishMarqueeSelection = useCallback(
    (rect) => {
      const left = Math.min(rect.x0, rect.x1);
      const right = Math.max(rect.x0, rect.x1);
      const top = Math.min(rect.y0, rect.y1);
      const bottom = Math.max(rect.y0, rect.y1);
      const ids = Object.entries(people)
        .filter(([, person]) => {
          const px = person.position?.x ?? 0;
          const py = person.position?.y ?? 0;
          return (
            px - CARD_WIDTH / 2 <= right &&
            px + CARD_WIDTH / 2 >= left &&
            py - CARD_HEIGHT / 2 <= bottom &&
            py + CARD_HEIGHT / 2 >= top
          );
        })
        .map(([id]) => id);
      onSelectMany(ids);
    },
    [people, onSelectMany]
  );

  const handleMarqueeMouseMove = useCallback((e) => {
    const start = marqueeStartRef.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!start || !box) return;

    if (!marqueeActiveRef.current) {
      const moved = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);
      if (moved < MARQUEE_THRESHOLD) return;
      marqueeActiveRef.current = true;
    }

    const v = viewRef.current;
    const rect = {
      x0: (start.clientX - box.left - v.x) / v.scale,
      y0: (start.clientY - box.top - v.y) / v.scale,
      x1: (e.clientX - box.left - v.x) / v.scale,
      y1: (e.clientY - box.top - v.y) / v.scale,
    };
    marqueeRectRef.current = rect;
    setMarqueeRect(rect);
  }, []);

  const handleMarqueeMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleMarqueeMouseMove);
    window.removeEventListener('mouseup', handleMarqueeMouseUp);
    marqueeStartRef.current = null;
    if (!marqueeActiveRef.current) return;
    marqueeActiveRef.current = false;
    // Read the last rect from the ref rather than a setState functional
    // updater — calling another component's setState (onSelectMany, which
    // ultimately updates App's selection state) from inside a React state
    // updater runs during React's render work and trips its "cannot update
    // a component while rendering a different one" guard. A plain event
    // handler doing the same thing is exactly what event handlers are for.
    const rect = marqueeRectRef.current;
    marqueeRectRef.current = null;
    setMarqueeRect(null);
    if (rect) finishMarqueeSelection(rect);
  }, [finishMarqueeSelection, handleMarqueeMouseMove]);

  const handleStageMouseDown = useCallback(
    (e) => {
      // A card's own drag/click handles itself; this is only for gestures
      // that start on the empty board.
      if (e.target !== e.target.getStage()) return;

      if (e.evt.button === 1 || (e.evt.button === 0 && spaceRef.current)) {
        e.evt.preventDefault();
        panRef.current = {
          startClientX: e.evt.clientX,
          startClientY: e.evt.clientY,
          startX: viewRef.current.x,
          startY: viewRef.current.y,
        };
        window.addEventListener('mousemove', handlePanMouseMove);
        window.addEventListener('mouseup', handlePanMouseUp);
        return;
      }

      if (e.evt.button !== 0) return;
      marqueeStartRef.current = { clientX: e.evt.clientX, clientY: e.evt.clientY };
      marqueeActiveRef.current = false;
      window.addEventListener('mousemove', handleMarqueeMouseMove);
      window.addEventListener('mouseup', handleMarqueeMouseUp);
    },
    [handlePanMouseMove, handlePanMouseUp, handleMarqueeMouseMove, handleMarqueeMouseUp]
  );

  // ---- Drag to connect ----

  // The same geometry RelationshipLines draws from, so a card lands on
  // exactly the line the user can see.
  const connectors = useMemo(
    () => buildConnectors(relationships, positions),
    [relationships, positions]
  );

  // Everything the card handlers below read, as of the latest render. The
  // handlers read it from here rather than closing over it, so they keep
  // one identity for the life of the board: PersonNode is memoised, and
  // handlers that changed with every edit made every card re-render after
  // every commit (AUDIT L16).
  const latest = useRef(null);
  latest.current = {
    people,
    selectedIds,
    connectors,
    onSelect,
    onEditPerson,
    onPersonContextMenu,
    onConflictClick,
    onDropOverlap,
    onDropOnConnector,
    onMovePerson,
    onMoveMany,
  };
  // Whether the drag in progress is a finger's. Set the moment it starts,
  // so the drop checks use the right tolerances from the first move on.
  const touchDragRef = useRef(false);

  // While a card is being dragged it sits on a layer of its own, so each
  // move redraws that card alone, not every card and line on the board
  // (AUDIT L17). It goes back to its exact place in the board's layer when
  // the drag ends, so the drawing order never changes.
  const dragLayerRef = useRef(null);
  const draggedHomeRef = useRef(null);

  const liftOntoDragLayer = useCallback((nodes) => {
    const dragLayer = dragLayerRef.current;
    if (!dragLayer) return;
    const home = nodes
      .filter(Boolean)
      .map((node) => ({ node, layer: node.getLayer(), index: node.zIndex() }))
      .filter((h) => h.layer && h.layer !== dragLayer)
      .sort((a, b) => a.index - b.index);
    home.forEach(({ node }) => node.moveTo(dragLayer));
    draggedHomeRef.current = home;
  }, []);

  const putBackFromDragLayer = useCallback(() => {
    const home = draggedHomeRef.current;
    draggedHomeRef.current = null;
    if (!home) return;
    // Lowest index first, so each one's index is valid when it's set.
    home.forEach(({ node, layer, index }) => {
      node.moveTo(layer);
      node.zIndex(Math.min(index, layer.getChildren().length - 1));
    });
    home[0]?.layer.batchDraw();
    dragLayerRef.current?.batchDraw();
  }, []);

  const findOverlapTarget = useCallback((draggedId, x, y) => {
    let best = null;
    let bestScore = touchDragRef.current ? TOUCH_OVERLAP_THRESHOLD : OVERLAP_THRESHOLD;
    Object.entries(latest.current.people).forEach(([id, other]) => {
      if (id === draggedId) return;
      const score = overlapFraction(x, y, other.position?.x ?? 0, other.position?.y ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    });
    return best;
  }, []);

  // A drop is read as one thing or the other, never both. Landing on a card
  // is the more specific gesture, so it is asked first: two people
  // overlapping means a link between those two, and only a drop that isn't
  // on anybody is offered to the lines.
  const findDropTarget = useCallback(
    (draggedId, x, y) => {
      const personId = findOverlapTarget(draggedId, x, y);
      if (personId) return { kind: 'person', personId };
      const tolerance = touchDragRef.current ? TOUCH_LINE_DROP_TOLERANCE : LINE_DROP_TOLERANCE;
      const connector = findConnectorAt(latest.current.connectors, x, y, tolerance, draggedId);
      if (connector) return { kind: 'connector', connector };
      return null;
    },
    [findOverlapTarget]
  );

  // Dragging one card out of a multi-selection (more than one person
  // selected, and this card is one of them) moves the whole group instead
  // of just this card — captured once, at drag start, as the anchor's own
  // position plus everyone else's, so a move mid-drag is just "the anchor's
  // delta so far" applied to each of them.
  const handleDragStart = useCallback(
    (personId, e) => {
      const { people, selectedIds } = latest.current;
      // Moving the card means it wasn't a hold.
      longPressRef.current.cancel();
      touchDragRef.current = isTouchEvent(e?.evt);
      setTouchDrag(touchDragRef.current);
      if (selectedIds.length > 1 && selectedIds.includes(personId)) {
        const anchor = people[personId]?.position;
        groupDragRef.current = {
          anchorId: personId,
          anchorStart: { x: anchor?.x ?? 0, y: anchor?.y ?? 0 },
          others: selectedIds
            .filter((id) => id !== personId)
            .map((id) => ({ id, x: people[id]?.position?.x ?? 0, y: people[id]?.position?.y ?? 0 })),
        };
        liftOntoDragLayer([e?.target, ...groupDragRef.current.others.map((o) => nodeRefs.current[o.id])]);
      } else {
        groupDragRef.current = null;
        liftOntoDragLayer([e?.target]);
      }
    },
    [liftOntoDragLayer]
  );

  const handleDragMove = useCallback(
    (personId, x, y) => {
      const group = groupDragRef.current;
      if (group && group.anchorId === personId) {
        // The other selected cards are moved directly through their Konva
        // nodes, not through React state — exactly like the anchor card
        // itself, which Konva is already moving natively. Going through
        // `people`/setState here instead would mean committing a history
        // entry on every pointer move.
        const dx = x - group.anchorStart.x;
        const dy = y - group.anchorStart.y;
        group.others.forEach((o) => {
          const node = nodeRefs.current[o.id];
          if (node) node.position({ x: o.x + dx, y: o.y + dy });
        });
        // They're all on the drag layer, so only it needs redrawing.
        dragLayerRef.current?.batchDraw();
        return;
      }

      const drop = findDropTarget(personId, x, y);
      const nextPerson = drop?.kind === 'person' ? drop.personId : null;
      const nextConnector = drop?.kind === 'connector' ? drop.connector.key : null;
      setHoverTargetId((prev) => (prev === nextPerson ? prev : nextPerson));
      setHoverConnectorKey((prev) => (prev === nextConnector ? prev : nextConnector));
    },
    [findDropTarget]
  );

  const handleDragEnd = useCallback(
    (personId, x, y, node) => {
      // A card can be dragged anywhere -- across rows, to reach someone to
      // link with or a line to drop onto -- but it only ever RESTS on its
      // own row. So whatever the drop turns out to be, every dragged card is
      // first put back exactly where it started, and the commit that follows
      // (if any) re-renders it from state at the spot it actually settles:
      // its row, at the dropped x, nudged only if it would overlap someone.
      // Doing it here, before React re-renders, means a card never flickers
      // at the point it was let go -- and a prop that ends up unchanged
      // (dropped back on its own spot) can't leave the node stranded there.
      const { people, onDropOverlap, onDropOnConnector, onMovePerson, onMoveMany } = latest.current;
      putBackFromDragLayer();
      const group = groupDragRef.current;
      if (group && group.anchorId === personId) {
        groupDragRef.current = null;
        touchDragRef.current = false;
        setTouchDrag(false);
        node?.position(group.anchorStart);
        group.others.forEach((o) => nodeRefs.current[o.id]?.position({ x: o.x, y: o.y }));
        stageRef.current?.batchDraw();
        const dx = x - group.anchorStart.x;
        // A jitter of a pixel or two isn't a move, and shouldn't cost an
        // undo step.
        if (Math.abs(dx) < 2) return;
        const updates = { [personId]: { x } };
        group.others.forEach((o) => {
          updates[o.id] = { x: o.x + dx };
        });
        onMoveMany(updates);
        return;
      }

      setHoverTargetId(null);
      setHoverConnectorKey(null);

      // Read before the drag is marked over: a touch drop is judged with
      // the touch tolerances, exactly like the moves before it.
      const drop = findDropTarget(personId, x, y);
      touchDragRef.current = false;
      setTouchDrag(false);
      const origin = people[personId]?.position;
      if (origin && node) {
        node.position({ x: origin.x, y: origin.y });
        node.getLayer()?.batchDraw();
      }

      // Both drop gestures are questions, not moves: a dialog opens and,
      // since nothing is committed, the board is left exactly as it was if
      // the dialog is cancelled.
      if (drop) {
        if (drop.kind === 'person') onDropOverlap(personId, drop.personId);
        else onDropOnConnector?.(drop.connector.parentIds, personId);
        return;
      }

      if (!origin || Math.abs(x - origin.x) < 2) return;
      onMovePerson(personId, x);
    },
    [findDropTarget, putBackFromDragLayer]
  );

  // ---- Person-level events ----
  //
  // Hoisted out of the people.map() below rather than written inline there:
  // an inline arrow function is a fresh identity every render regardless of
  // what actually changed, which would defeat PersonNode's memoization for
  // every card, every render (see personPropsAreEqual in PersonNode.jsx).
  // Neither of these closes over a specific person — PersonNode itself
  // already curries its own id in before calling back out (see
  // `onClick={(e) => onClick(person.id, e)}` there) — so one shared
  // function per Canvas render is enough for every card on the board.

  // Shift/Cmd-click adds to the selection on a real keyboard; a touchscreen
  // has neither key, so a tap has to mean the same thing on its own —
  // otherwise picking two people to link on mobile is simply impossible,
  // since every tap would replace the selection instead of building a pair.
  const handlePersonClick = useCallback(
    (personId, e) => {
      if (endsLongPress(e, longPressRef.current)) return;
      setCurrentId(personId);
      latest.current.onSelect(personId, e.evt.shiftKey || e.evt.metaKey || isTouchEvent(e.evt));
    },
    []
  );

  // Android sends its own `contextmenu` for a held finger. Whichever of
  // that and the long-press timer comes first opens the menu; the other is
  // ignored.
  const menuAlreadyOpenedByHold = useCallback((personId) => {
    const longPress = longPressRef.current;
    if (Date.now() - lastLongPressAtRef.current < 1000) return true;
    if (longPress.pending) {
      longPress.claim();
      lastLongPressAtRef.current = Date.now();
      holdStill(personId);
    }
    return false;
  }, [holdStill]);

  const handlePersonContextMenu = useCallback(
    (personId, e) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      if (menuAlreadyOpenedByHold(personId)) return;
      latest.current.onPersonContextMenu(personId, e.evt.clientX, e.evt.clientY);
    },
    [menuAlreadyOpenedByHold]
  );

  const handlePersonDblClick = useCallback((personId) => latest.current.onEditPerson(personId), []);
  const handleConflictBadgeClick = useCallback((personId) => latest.current.onConflictClick?.(personId), []);

  // ---- Stage-level events ----

  const handleStageClick = useCallback(
    (e) => {
      if (endsLongPress(e, longPressRef.current)) return;
      if (e.target === e.target.getStage()) onSelect(null);
    },
    [onSelect]
  );

  const handleContextMenu = useCallback(
    (e) => {
      e.evt.preventDefault();
      if (e.target !== e.target.getStage()) return;
      if (menuAlreadyOpenedByHold(null)) return;
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;
      const worldX = (pointer.x - view.x) / view.scale;
      onCanvasContextMenu(e.evt.clientX, e.evt.clientY, worldX);
    },
    [onCanvasContextMenu, view, menuAlreadyOpenedByHold]
  );

  // ---- Keyboard ----
  //
  // The board is one Tab stop; the keys move a "current person" around it
  // (see utils/boardNav.js for the rules). Only keys pressed on the board
  // itself count, not on the zoom buttons inside it.

  const liveCurrentId = currentId && people[currentId] ? currentId : null;

  // Pans just enough to keep the person on screen, and returns the view it
  // ends up at.
  const reveal = useCallback(
    (id) => {
      const person = people[id];
      if (!person) return viewRef.current;
      const next = revealView(viewRef.current, size, { x: person.position?.x ?? 0, y: person.position?.y ?? 0 });
      if (next !== viewRef.current) setView(next);
      return next;
    },
    [people, size]
  );

  const openMenuFromKeyboard = useCallback(
    (id) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      if (!id) {
        const v = viewRef.current;
        const centre = { x: size.width / 2, y: size.height / 2 };
        onCanvasContextMenu(box.left + centre.x, box.top + centre.y, (centre.x - v.x) / v.scale);
        return;
      }
      // Just under the card, so the menu doesn't cover who it's about.
      const v = reveal(id);
      const pos = people[id].position || { x: 0, y: 0 };
      onPersonContextMenu(
        id,
        box.left + v.x + (pos.x ?? 0) * v.scale,
        box.top + v.y + ((pos.y ?? 0) + CARD_HEIGHT / 2) * v.scale + 6
      );
    },
    [people, size, reveal, onCanvasContextMenu, onPersonContextMenu]
  );

  const handleBoardKeyDown = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return;
      const command = boardKeyCommand(e);
      if (!command) return;
      // Space after a mouse click is still hold-Space-to-pan; it only
      // selects once the keyboard is in use.
      if (command.type === 'toggle' && (!keyboardActive || e.repeat)) return;
      e.preventDefault();
      setKeyboardActive(true);

      if (command.type === 'move') {
        const id = nextCurrent(people, liveCurrentId, selectedIds, command.direction);
        if (!id) return;
        setCurrentId(id);
        reveal(id);
        if (!command.extend) onSelect(id, false);
        else if (!selectedIds.includes(id)) onSelect(id, true);
        return;
      }

      const id = liveCurrentId || startingPerson(people, selectedIds);
      if (command.type === 'menu') {
        if (id) setCurrentId(id);
        openMenuFromKeyboard(id);
        return;
      }
      if (!id) return;
      setCurrentId(id);
      if (command.type === 'edit') onEditPerson(id);
      else onSelect(id, true);
    },
    [keyboardActive, people, liveCurrentId, selectedIds, reveal, onSelect, onEditPerson, openMenuFromKeyboard]
  );

  // Tabbing in shows the ring; a click that focuses the board doesn't.
  // :focus-visible is the browser's own call on which of the two it was,
  // including when focus comes back from a menu or dialog.
  const handleBoardFocus = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return;
      let fromKeyboard;
      try {
        fromKeyboard = e.currentTarget.matches(':focus-visible');
      } catch {
        fromKeyboard = false;
      }
      if (!fromKeyboard) return;
      setKeyboardActive(true);
      const id = liveCurrentId || startingPerson(people, selectedIds);
      if (id) {
        setCurrentId(id);
        reveal(id);
      }
    },
    [liveCurrentId, people, selectedIds, reveal]
  );

  const handleBoardBlur = useCallback((e) => {
    if (e.target === e.currentTarget) setKeyboardActive(false);
  }, []);

  // The keyboard menu keys also make the browser fire `contextmenu` at the
  // board itself; its own menu mustn't open on top of this one. A real
  // right-click lands on the canvas inside, which Konva handles as before.
  const handleBoardNativeMenu = useCallback((e) => {
    if (e.target === e.currentTarget) e.preventDefault();
  }, []);

  const handleBoardPointerDown = useCallback(() => setKeyboardActive(false), []);

  const ringPerson = keyboardActive && !exportTheme && liveCurrentId ? people[liveCurrentId] : null;
  const announcement = keyboardActive && liveCurrentId
    ? describePerson(people[liveCurrentId], selectedIds.includes(liveCurrentId))
    : '';

  const isEmpty = Object.keys(people).length === 0;

  // The whole point of this banner: on a touch drag, the finger sits right
  // on top of the highlight that would otherwise say what's about to
  // happen. A fixed-position line of text, safely away from wherever the
  // thumb actually is, says it in words instead — reusing the exact same
  // hover state the highlight itself is drawn from, so the two can never
  // disagree about what's currently under the card.
  const dropHint = useMemo(() => {
    if (!touchDrag) return null;
    if (hoverTargetId) {
      return `Drop to link with ${nameOf(people, hoverTargetId) || 'this person'}`;
    }
    if (hoverConnectorKey) {
      const connector = connectors.find((c) => c.key === hoverConnectorKey);
      const names = (connector?.parentIds || []).map((id) => nameOf(people, id)).filter(Boolean);
      return names.length ? `Drop to add a child of ${names.join(' and ')}` : 'Drop to add a child here';
    }
    return 'Drag onto a person or a line to link them';
  }, [touchDrag, hoverTargetId, hoverConnectorKey, people, connectors]);

  return (
    <div
      ref={containerRef}
      className="board-surface relative h-full w-full touch-none overflow-hidden"
      style={spaceHeld ? { cursor: 'grab' } : undefined}
      tabIndex={0}
      role="application"
      aria-label="Family tree board"
      aria-describedby="board-keys-help"
      onKeyDown={handleBoardKeyDown}
      onFocus={handleBoardFocus}
      onBlur={handleBoardBlur}
      onContextMenu={handleBoardNativeMenu}
      onPointerDown={handleBoardPointerDown}
    >
      <p id="board-keys-help" className="sr-only">
        {BOARD_KEYS_HELP}
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        onMouseDown={handleStageMouseDown}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer>
          {/* Paper behind everything, so exported images aren't transparent.
              Only while exporting: on screen it hid the board's grid inside
              a hard-edged box around the tree. */}
          {exportTheme && (
            <Rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.maxX - bounds.minX}
              height={bounds.maxY - bounds.minY}
              fill={exportTheme.background}
              listening={false}
            />
          )}

          <RelationshipLines
            relationships={relationships}
            positions={positions}
            onSelect={onRelationshipClick}
            highlightKey={hoverConnectorKey}
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
              registerRef={getRegisterRef(id)}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onClick={handlePersonClick}
              onDblClick={handlePersonDblClick}
              onContextMenu={handlePersonContextMenu}
              onConflictClick={handleConflictBadgeClick}
              exportTheme={exportTheme}
            />
          ))}

          {ringPerson &&
            (shapeForGender(ringPerson.gender) === 'circle' ? (
              <Ellipse
                x={ringPerson.position?.x ?? 0}
                y={ringPerson.position?.y ?? 0}
                radiusX={CARD_WIDTH / 2 + RING_GAP}
                radiusY={CARD_HEIGHT / 2 + RING_GAP}
                stroke="#0B6E7C"
                strokeWidth={2.5}
                dash={[7, 5]}
                listening={false}
              />
            ) : (
              <Rect
                x={(ringPerson.position?.x ?? 0) - CARD_WIDTH / 2 - RING_GAP}
                y={(ringPerson.position?.y ?? 0) - CARD_HEIGHT / 2 - RING_GAP}
                width={CARD_WIDTH + RING_GAP * 2}
                height={CARD_HEIGHT + RING_GAP * 2}
                cornerRadius={4}
                stroke="#0B6E7C"
                strokeWidth={2.5}
                dash={[7, 5]}
                listening={false}
              />
            ))}

          {marqueeRect && (
            <Rect
              x={Math.min(marqueeRect.x0, marqueeRect.x1)}
              y={Math.min(marqueeRect.y0, marqueeRect.y1)}
              width={Math.abs(marqueeRect.x1 - marqueeRect.x0)}
              height={Math.abs(marqueeRect.y1 - marqueeRect.y0)}
              fill="rgba(14,165,183,0.12)"
              stroke="#0EA5B7"
              strokeWidth={1.5 / view.scale}
              dash={[6 / view.scale, 4 / view.scale]}
              listening={false}
            />
          )}

          {memo && (
            <Text
              text={memo}
              x={bounds.minX + 28}
              y={bounds.maxY - 52}
              fontFamily={exportTheme?.fontFamily || 'Proxima Nova, proxima-nova, system-ui, sans-serif'}
              fontSize={17}
              fill={exportTheme?.memoColor || '#4E6E77'}
              listening={false}
            />
          )}
        </Layer>
        {/* Holds only the card(s) being dragged; empty otherwise. Export
            captures the first layer only, so it never shows up there. */}
        <Layer ref={dragLayerRef} />
      </Stage>

      {/* Touch-drag only: says in words what the hover highlight can't,
          because the finger doing the dragging is sitting right on top of
          it. Fixed at the top, out of the way of wherever the thumb
          actually is, and never intercepts a touch itself. */}
      {dropHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 max-w-[88%] -translate-x-1/2 rounded-xl border border-hairline bg-white/95 px-3.5 py-2 text-center text-xs font-medium text-ink shadow-card backdrop-blur">
          {dropHint}
        </div>
      )}

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
              className="mt-4 w-full rounded-xl bg-cyan-deep px-4 py-2.5 font-medium text-white transition-all hover:bg-ink"
            >
              Add the first person
            </button>
          </div>
        </div>
      )}

      {/* Zoom pod. Also the touch fallback for people who can't scroll-zoom. */}
      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl border border-hairline bg-white/95 p-1 shadow-card backdrop-blur">
        <ZoomButton label="Zoom out" onClick={() => zoomAround(1 / ZOOM_BUTTON_STEP, size.width / 2, size.height / 2)}>
          <span className="text-lg leading-none">−</span>
        </ZoomButton>
        <span className="tnum w-11 select-none text-center text-xs text-mist">
          {Math.round(view.scale * 100)}%
        </span>
        <ZoomButton label="Zoom in" onClick={() => zoomAround(ZOOM_BUTTON_STEP, size.width / 2, size.height / 2)}>
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
