import { describe, expect, it } from 'vitest';
import { buildConnectors } from './connectors';

const positions = {
  m: { x: 0, y: 120 },
  f: { x: 200, y: 120 },
  c1: { x: -100, y: 330 },
  c2: { x: 300, y: 330 },
};

describe('parent connectors: clickable per-child drops (F2)', () => {
  it("each child's drop carries exactly that child's parent links", () => {
    const relationships = {
      p1: { id: 'p1', kind: 'parent', a: 'm', b: 'c1', type: 'birth' },
      p2: { id: 'p2', kind: 'parent', a: 'f', b: 'c1', type: 'birth' },
      p3: { id: 'p3', kind: 'parent', a: 'm', b: 'c2', type: 'birth' },
      p4: { id: 'p4', kind: 'parent', a: 'f', b: 'c2', type: 'birth' },
    };
    const [parent] = buildConnectors(relationships, positions).filter((c) => c.kind === 'parent');

    expect(parent.childLinks).toHaveLength(2);
    const byChild = Object.fromEntries(parent.childLinks.map((l) => [l.childId, l]));
    expect(byChild.c1.relIds.sort()).toEqual(['p1', 'p2']);
    expect(byChild.c2.relIds.sort()).toEqual(['p3', 'p4']);
    // A vertical at the child's x, ending at the top of its card.
    const [x1, , x2, y2] = byChild.c1.segment;
    expect(x1).toBe(-100);
    expect(x2).toBe(-100);
    expect(y2).toBeLessThan(330);
  });
});
