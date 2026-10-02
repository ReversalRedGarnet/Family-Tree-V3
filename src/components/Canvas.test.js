// @vitest-environment jsdom
//
// Konva needs a real canvas, so react-konva is swapped for plain stand-ins
// that record what each shape was rendered with. That's enough to check
// which cards React re-renders, and to drive a card's drag handlers.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h, forwardRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';

const { renders, groups } = vi.hoisted(() => ({ renders: [], groups: new Map() }));

vi.mock('react-konva', async () => {
  const { createElement, forwardRef: fwd } = await import('react');
  const shape = (name) =>
    fwd(function KonvaStandIn({ children, ...props }, _ref) {
      if (name === 'Text') renders.push(props.text);
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
