// @vitest-environment jsdom
//
// Konva needs a real canvas, so react-konva is swapped for plain stand-ins
// that record what each shape was rendered with. That's enough to check
// which cards React re-renders, and to drive a card's drag handlers.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h, forwardRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { renders, groups, stage } = vi.hoisted(() => ({ renders: [], groups: new Map(), stage: { props: null } }));

vi.mock('react-konva', async () => {
  const { createElement, forwardRef: fwd } = await import('react');
  const shape = (name) =>
    fwd(function KonvaStandIn({ children, ...props }, _ref) {
      if (name === 'Text') renders.push(props.text);
      if (name === 'Stage') stage.props = props;
      // A card's outer group is the draggable one; keyed by its x so the
      // test can find it again.
      if (name === 'Group' && props.draggable) groups.set(props.x, props);
      return createElement('div', { 'data-konva': name }, children);
    });
  return {
    Stage: shape('Stage'),
    Layer: shape('Layer'),
    Group: shape('Group'),
    Rect: shape('Rect'),
    Ellipse: shape('Ellipse'),
    Circle: shape('Circle'),
    Text: shape('Text'),
    Line: shape('Line'),
    Shape: shape('Shape'),
    Arc: shape('Arc'),
    Path: shape('Path'),
  };
});

import Canvas from './Canvas';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  renders.length = 0;
  groups.clear();
});

const person = (id, firstName, x) => ({ id, firstName, lastName: 'Lee', gender: 'male', position: { x, y: 120 } });

// App hands Canvas brand-new callbacks after every edit (they close over
// the tree); this mimics that.
function propsFor(people, overrides = {}) {
  return {
    people,
    relationships: {},
    conflicts: new Set(),
    selectedIds: [],
    onSelect: () => {},
    onSelectMany: () => {},
    onMovePerson: vi.fn(),
    onMoveMany: vi.fn(),
    onEditPerson: () => {},
    onPersonContextMenu: () => {},
    onCanvasContextMenu: () => {},
    onDropOverlap: vi.fn(),
    onDropOnConnector: vi.fn(),
    onRelationshipClick: () => {},
    onAddFirstPerson: () => {},
    onConflictClick: () => {},
    ...overrides,
  };
}

const Board = forwardRef(function Board(props, ref) {
  return h(Canvas, { ...props, ref });
});

describe('cards re-render only when they change (L16)', () => {
  it('an edit to one person re-renders only that card, even with fresh callbacks from App', () => {
    const ann = person('a', 'Ann', 100);
    const bea = person('b', 'Bea', 300);
    const cy = person('c', 'Cy', 500);
    const { rerender } = render(h(Board, propsFor({ a: ann, b: bea, c: cy })));
    expect(renders).toEqual(expect.arrayContaining(['Ann Lee', 'Bea Lee', 'Cy Lee']));

    renders.length = 0;
    const annEdited = { ...ann, firstName: 'Anne' };
    rerender(h(Board, propsFor({ a: annEdited, b: bea, c: cy }, { selectedIds: [] })));

    expect(renders).toContain('Anne Lee');
    expect(renders).not.toContain('Bea Lee');
    expect(renders).not.toContain('Cy Lee');
  });

  it("a drag that ends uses the board as it is now, not when the card last rendered", () => {
    const ann = person('a', 'Ann', 100);
    const bea = person('b', 'Bea', 400);
    const first = propsFor({ a: ann, b: bea });
    const { rerender } = render(h(Board, first));

    // An edit elsewhere: Bea moves next to where Ann will be dropped, and
    // App's callbacks are new. Ann's card itself doesn't re-render.
    const beaMoved = { ...bea, position: { x: 700, y: 120 } };
    const second = propsFor({ a: ann, b: beaMoved });
    rerender(h(Board, second));

    const card = groups.get(100);
    const node = {
      x: () => 690,
      y: () => 120,
      position: vi.fn(),
      getLayer: () => ({ batchDraw() {} }),
      zIndex: () => 0,
      moveTo: vi.fn(),
    };
    act(() => {
      card.onDragStart({ target: node, evt: { type: 'mousedown' } });
      card.onDragEnd({ target: node, evt: { type: 'mouseup' } });
    });

    // Dropped on Bea where she is NOW, so it's a link question, asked
    // through the newest callback.
    expect(second.onDropOverlap).toHaveBeenCalledWith('a', 'b');
    expect(first.onDropOverlap).not.toHaveBeenCalled();
    expect(second.onMovePerson).not.toHaveBeenCalled();
  });
});

describe('Space belongs to the focused control (F10)', () => {
  // fireEvent returns false when the event's default was prevented, i.e.
  // when the browser would NOT press the button / tick the box.
  const pressSpace = (el) => fireEvent.keyDown(el, { key: ' ', code: 'Space' });

  function setup() {
    render(
      h(
        'div',
        null,
        h('button', null, 'Export'),
        h('input', { type: 'checkbox', 'aria-label': 'Living' }),
        h('a', { href: '#x' }, 'A link'),
        h(Board, propsFor({ a: person('a', 'Ann', 100) }))
      )
    );
  }

  it('a focused button, checkbox or link keeps Space', () => {
    setup();
    for (const el of [screen.getByText('Export'), screen.getByLabelText('Living'), screen.getByText('A link')]) {
      el.focus();
      expect(pressSpace(el)).toBe(true);
    }
  });

  it('a button inside the board (zoom) keeps Space too', () => {
    setup();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    zoomIn.focus();
    expect(pressSpace(zoomIn)).toBe(true);
  });

  it('with the board focused, or nothing focused, Space is hold-to-pan', () => {
    setup();
    const board = screen.getByRole('application', { name: 'Family tree board' });
    act(() => board.focus());
    expect(pressSpace(board)).toBe(false);
    fireEvent.keyUp(board, { key: ' ', code: 'Space' });
    act(() => board.blur());
    expect(document.activeElement).toBe(document.body);
    expect(pressSpace(document.body)).toBe(false);
    fireEvent.keyUp(document.body, { key: ' ', code: 'Space' });
  });
});

describe('a click then a quick right-click is not a double-click (F11)', () => {
  function card() {
    const onEditPerson = vi.fn();
    render(h(Board, propsFor({ a: person('a', 'Ann', 100) }, { onEditPerson })));
    const group = groups.get(100);
    const press = (button) => act(() => group.onMouseDown({ evt: { button } }));
    const dblclick = (button) => act(() => group.onDblClick({ evt: { button } }));
    return { group, onEditPerson, press, dblclick };
  }

  it('left then right does not open Edit', () => {
    const { onEditPerson, press, dblclick } = card();
    press(0);
    press(2);
    dblclick(2);
    expect(onEditPerson).not.toHaveBeenCalled();
  });

  it('right then left does not either', () => {
    const { onEditPerson, press, dblclick } = card();
    press(2);
    press(0);
    dblclick(0);
    expect(onEditPerson).not.toHaveBeenCalled();
  });

  it('a real double-click, and a double-tap, still open Edit', () => {
    const { group, onEditPerson, press, dblclick } = card();
    press(0);
    press(0);
    dblclick(0);
    expect(onEditPerson).toHaveBeenCalledWith('a');
    act(() => group.onDblTap({ evt: {} }));
    expect(onEditPerson).toHaveBeenCalledTimes(2);
  });
});

describe('panning the board (regression after F10)', () => {
  // A stand-in for the Konva event a mousedown on empty board produces.
  const boardTarget = { getStage() { return boardTarget; } };
  const stageMouseDown = (button, x, y, shiftKey = false) =>
    act(() =>
      stage.props.onMouseDown({ target: boardTarget, evt: { button, shiftKey, clientX: x, clientY: y, preventDefault() {} } })
    );
  const mouseMove = (x, y, shiftKey = false) =>
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, shiftKey })));
  const mouseUp = (x, y) => act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y })));
  const where = () => [stage.props.x, stage.props.y];
  const space = (el, type) =>
    (type === 'down' ? fireEvent.keyDown : fireEvent.keyUp)(el, { key: ' ', code: 'Space' });

  function setup(overrides = {}) {
    const props = propsFor({ a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) }, overrides);
    render(h('div', null, h('button', null, 'Tidy the layout'), h(Board, props)));
    return props;
  }

  it('middle-button drag on empty board pans', () => {
    setup();
    stageMouseDown(1, 100, 100);
    mouseUp(180, 150);
    expect(where()).toEqual([80, 50]);
  });

  it('Space+drag pans right after a sidebar button was clicked, and releasing Space then leaves the button unpressed', () => {
    setup();
    const button = screen.getByText('Tidy the layout');
    button.focus();
    // F10 still holds: the press itself is left to the button.
    expect(space(button, 'down')).toBe(true);
    stageMouseDown(0, 100, 100);
    mouseUp(160, 140);
    expect(where()).toEqual([60, 40]);
    // The pan used Space, so its release mustn't also press the button.
    expect(space(button, 'up')).toBe(false);
  });

  it('Space on a focused button with no drag still presses it (F10)', () => {
    setup();
    const button = screen.getByText('Tidy the layout');
    button.focus();
    expect(space(button, 'down')).toBe(true);
    expect(space(button, 'up')).toBe(true);
    expect(where()).toEqual([0, 0]);
  });

  it('Space+drag pans with the board focused', () => {
    setup();
    const board = screen.getByRole('application', { name: 'Family tree board' });
    act(() => board.focus());
    expect(space(board, 'down')).toBe(false);
    stageMouseDown(0, 100, 100);
    mouseUp(130, 120);
    space(board, 'up');
    expect(where()).toEqual([30, 20]);
  });

  it('a plain left-drag on empty board pans, and selects nobody', () => {
    const { onSelect, onSelectMany } = setup({ onSelect: vi.fn(), onSelectMany: vi.fn() });
    stageMouseDown(0, 100, 100);
    mouseMove(150, 130);
    mouseUp(180, 150);
    expect(where()).toEqual([80, 50]);
    expect(onSelectMany).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Shift + drag on empty board draws the selection box instead of panning', () => {
    const { onSelectMany } = setup({ onSelectMany: vi.fn() });
    // Board coordinates match the screen here (view at 0,0, scale 1): the
    // box from (0,0) to (200,250) takes in Ann (x 100) but not Bea (card from x 221).
    stageMouseDown(0, 0, 0, true);
    mouseMove(200, 250, true);
    mouseUp(200, 250);
    expect(onSelectMany).toHaveBeenCalledWith(['a']);
    expect(where()).toEqual([0, 0]);
  });

  it('letting go of Shift halfway through keeps it a selection box', () => {
    const { onSelectMany } = setup({ onSelectMany: vi.fn() });
    stageMouseDown(0, 0, 0, true);
    mouseMove(120, 120, false);
    mouseMove(200, 250, false);
    mouseUp(200, 250);
    expect(onSelectMany).toHaveBeenCalledWith(['a']);
    expect(where()).toEqual([0, 0]);
  });

  it('a wobble smaller than the click threshold is a click: no pan, the selection clears', () => {
    const { onSelect } = setup({ onSelect: vi.fn(), selectedIds: ['a'] });
    stageMouseDown(0, 100, 100);
    mouseMove(102, 101);
    mouseUp(102, 101);
    expect(where()).toEqual([0, 0]);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('arrow keys: pan unless a person is in play', () => {
  const where = () => [stage.props.x, stage.props.y];
  const press = (el, key, shiftKey = false) => act(() => fireEvent.keyDown(el, { key, shiftKey }));

  it('with nothing focused and nobody selected, arrows pan the board (Shift: further)', () => {
    const props = propsFor({ a: person("a", "Ann", 100), b: person("b", "Bea", 300) });
    render(h(Board, props));
    press(document.body, 'ArrowRight');
    expect(where()).toEqual([-60, 0]);
    press(document.body, 'ArrowUp', true);
    expect(where()).toEqual([-60, 240]);
  });

  it('with the board focused and nobody selected, arrows pan', () => {
    const onSelect = vi.fn();
    render(h(Board, propsFor({ a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) }, { onSelect })));
    const board = screen.getByRole('application', { name: 'Family tree board' });
    act(() => board.focus());
    press(board, 'ArrowDown');
    press(board, 'ArrowLeft');
    expect(where()).toEqual([60, -60]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('with a card selected, arrows move between people and leave the view alone', () => {
    const onSelect = vi.fn();
    render(h(Board, propsFor({ a: person('a', 'Ann', 200), b: person('b', 'Bea', 400) }, { onSelect, selectedIds: ['a'] })));
    const board = screen.getByRole('application', { name: 'Family tree board' });
    act(() => board.focus());
    press(board, 'ArrowRight'); // lands on Ann (where the keyboard starts)
    press(board, 'ArrowRight');
    expect(onSelect).toHaveBeenLastCalledWith('b', false);
    expect(where()).toEqual([0, 0]);
  });

  it('Escape takes the person out of play, so arrows pan again', () => {
    const onSelect = vi.fn();
    const people = { a: person('a', 'Ann', 200), b: person('b', 'Bea', 400) };
    const { rerender } = render(h(Board, propsFor(people, { onSelect, selectedIds: ['a'] })));
    const board = screen.getByRole('application', { name: 'Family tree board' });
    act(() => board.focus());
    press(board, 'ArrowRight');
    press(board, 'Escape');
    // App clears the selection on Escape.
    rerender(h(Board, propsFor(people, { onSelect, selectedIds: [] })));
    press(board, 'ArrowRight');
    expect(where()).toEqual([-60, 0]);
  });

  it('arrows on another focused control are left to it', () => {
    render(h('div', null, h('button', null, 'Undo'), h(Board, propsFor({ a: person('a', 'Ann', 100) }))));
    const button = screen.getByText('Undo');
    button.focus();
    expect(fireEvent.keyDown(button, { key: 'ArrowRight' })).toBe(true);
    expect(where()).toEqual([0, 0]);
  });
});

describe('a click on empty board (no movement)', () => {
  const boardTarget = { getStage() { return boardTarget; } };
  const down = (x, y) =>
    act(() => stage.props.onMouseDown({ target: boardTarget, evt: { button: 0, shiftKey: false, clientX: x, clientY: y, preventDefault() {} } }));
  const move = (x, y) => act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y })));
  const up = (x, y) => act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y })));
  const touchStart = (x, y) => act(() => stage.props.onTouchStart({ target: boardTarget, evt: { touches: [{ clientX: x, clientY: y }] } }));
  const touchMove = (x, y) =>
    act(() => stage.props.onTouchMove({ target: boardTarget, evt: { touches: [{ clientX: x, clientY: y }], preventDefault() {} } }));
  const touchEnd = () => act(() => stage.props.onTouchEnd({ target: boardTarget, evt: { touches: [], cancelable: true, preventDefault() {} } }));

  function setup(overrides = {}) {
    const props = propsFor(
      { a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) },
      { onSelect: vi.fn(), onBoardClickMenu: vi.fn(), ...overrides }
    );
    render(h(Board, props));
    return props;
  }

  it('with nobody selected, opens the board menu at the click (with the board x for Add person here)', () => {
    const { onSelect, onBoardClickMenu } = setup();
    down(500, 400);
    up(501, 400);
    expect(onBoardClickMenu).toHaveBeenCalledWith(501, 400, 501);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('with someone selected, only clears the selection', () => {
    const { onSelect, onBoardClickMenu } = setup({ selectedIds: ['a'] });
    down(500, 400);
    up(500, 400);
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onBoardClickMenu).not.toHaveBeenCalled();
  });

  it('the click that closes an open menu does nothing else', () => {
    const { onSelect, onBoardClickMenu } = setup({ menuOpen: true });
    down(500, 400);
    up(500, 400);
    expect(onBoardClickMenu).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('no menu after a pan or a selection box', () => {
    const { onBoardClickMenu } = setup();
    down(500, 400);
    move(560, 430);
    up(560, 430);
    act(() =>
      stage.props.onMouseDown({ target: boardTarget, evt: { button: 0, shiftKey: true, clientX: 500, clientY: 400, preventDefault() {} } })
    );
    move(600, 500);
    up(600, 500);
    expect(onBoardClickMenu).not.toHaveBeenCalled();
  });

  it('a tap is a click too; a finger that moves is a pan, not a tap', () => {
    const { onBoardClickMenu } = setup();
    touchStart(500, 400);
    touchEnd();
    expect(onBoardClickMenu).toHaveBeenCalledTimes(1);
    touchStart(500, 400);
    touchMove(540, 420);
    touchEnd();
    expect(onBoardClickMenu).toHaveBeenCalledTimes(1);
  });

  it('a tap with someone selected only clears the selection', () => {
    const { onSelect, onBoardClickMenu } = setup({ selectedIds: ['a'] });
    touchStart(500, 400);
    touchEnd();
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onBoardClickMenu).not.toHaveBeenCalled();
  });
});

describe('Select multiple (armed tool) and the hint chip', () => {
  const boardTarget = { getStage() { return boardTarget; } };
  const down = (x, y) =>
    act(() => stage.props.onMouseDown({ target: boardTarget, evt: { button: 0, shiftKey: false, clientX: x, clientY: y, preventDefault() {} } }));
  const move = (x, y) => act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y })));
  const up = (x, y) => act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y })));
  const where = () => [stage.props.x, stage.props.y];
  const chip = () => screen.getByRole('status', { hidden: true });

  function setup(overrides = {}) {
    const props = propsFor(
      { a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) },
      { selectArmed: true, onSelectArmedChange: vi.fn(), onSelectMany: vi.fn(), onBoardClickMenu: vi.fn(), onSelect: vi.fn(), ...overrides }
    );
    const utils = render(h(Board, props));
    return { ...props, ...utils };
  }

  it('armed, a left-drag draws the box instead of panning, selects who it caught, then disarms', () => {
    const { onSelectMany, onSelectArmedChange } = setup();
    down(0, 0);
    move(100, 100);
    up(200, 250);
    expect(where()).toEqual([0, 0]);
    expect(onSelectMany).toHaveBeenCalledWith(['a']);
    expect(onSelectArmedChange).toHaveBeenCalledWith(false);
  });

  it('armed, a box that catches nobody leaves the selection as it was, and disarms', () => {
    const { onSelectMany, onSelect, onSelectArmedChange } = setup({ selectedIds: ['b'] });
    down(600, 500);
    move(650, 550);
    up(700, 600);
    expect(onSelectMany).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSelectArmedChange).toHaveBeenCalledWith(false);
  });

  it('armed, a click just cancels it: no menu', () => {
    const { onBoardClickMenu, onSelectArmedChange } = setup();
    down(600, 500);
    up(600, 500);
    expect(onSelectArmedChange).toHaveBeenCalledWith(false);
    expect(onBoardClickMenu).not.toHaveBeenCalled();
  });

  it('Escape cancels the armed tool and nothing else reaches the app', () => {
    const appEscape = vi.fn();
    window.addEventListener('keydown', appEscape);
    try {
      const { onSelectArmedChange } = setup({ selectedIds: ['a'] });
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onSelectArmedChange).toHaveBeenCalledWith(false);
      expect(appEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', appEscape);
    }
  });

  it('starting a drag on a card still moves the card, and disarms the tool', () => {
    const { onSelectArmedChange } = setup();
    const card = groups.get(100);
    const node = { x: () => 100, y: () => 120, position() {}, getLayer: () => ({ batchDraw() {} }), zIndex: () => 0, moveTo() {} };
    act(() => card.onDragStart({ target: node, evt: { type: 'mousedown' } }));
    expect(onSelectArmedChange).toHaveBeenCalledWith(false);
    act(() => card.onDragEnd({ target: node, evt: { type: 'mouseup' } }));
  });

  it('armed on touch: a one-finger drag draws the box', () => {
    const { onSelectMany, onSelectArmedChange } = setup();
    act(() => stage.props.onTouchStart({ target: boardTarget, evt: { touches: [{ clientX: 0, clientY: 0 }] } }));
    act(() => stage.props.onTouchMove({ target: boardTarget, evt: { touches: [{ clientX: 200, clientY: 250 }], preventDefault() {} } }));
    act(() => stage.props.onTouchEnd({ target: boardTarget, evt: { touches: [], cancelable: true, preventDefault() {} } }));
    expect(onSelectMany).toHaveBeenCalledWith(['a']);
    expect(onSelectArmedChange).toHaveBeenCalledWith(false);
    expect(where()).toEqual([0, 0]);
  });

  it('the chip says what the armed tool does, then how many are selected', () => {
    const props = { onSelectArmedChange: vi.fn() };
    const { rerender } = render(
      h(Board, propsFor({ a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) }, { ...props, selectArmed: true }))
    );
    expect(chip().textContent).toBe('Drag to select people · Esc to cancel');
    rerender(h(Board, propsFor({ a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) }, { ...props, selectArmed: false, selectedIds: ['a', 'b'] })));
    expect(chip().textContent).toBe('2 selected · drag to move · Esc or click empty space to clear');
    rerender(h(Board, propsFor({ a: person('a', 'Ann', 100), b: person('b', 'Bea', 300) }, { ...props, selectArmed: false, selectedIds: [] })));
    expect(chip().textContent).toBe('');
    expect(chip().getAttribute('aria-live')).toBe('polite');
  });
});
