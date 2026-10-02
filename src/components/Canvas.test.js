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
  const stageMouseDown = (button, x, y) =>
    act(() => stage.props.onMouseDown({ target: boardTarget, evt: { button, clientX: x, clientY: y, preventDefault() {} } }));
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

  it('a plain left-drag on empty board is still a selection box, not a pan', () => {
    setup();
    stageMouseDown(0, 100, 100);
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 })));
    mouseUp(200, 200);
    expect(where()).toEqual([0, 0]);
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
