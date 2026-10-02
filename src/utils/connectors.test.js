import { describe, expect, it } from 'vitest';
import { buildConnectors, findConnectorAt } from './connectors';
import { CARD_HEIGHT } from './constants';

const HALF_H = CARD_HEIGHT / 2;

describe('partner lines never run behind other cards (F4)', () => {
  // Ann - Yan - Xavi - Zed in one row, 202 apart. Ann is with Yan, and has
  // ended partnerships with Xavi and Zed.
  const row = { ann: { x: 0, y: 120 }, yan: { x: 202, y: 120 }, xavi: { x: 404, y: 120 }, zed: { x: 606, y: 120 } };
  const rels = {
    current: { id: 'current', kind: 'partner', a: 'ann', b: 'yan', status: 'together' },
    ex1: { id: 'ex1', kind: 'partner', a: 'ann', b: 'xavi', status: 'divorced' },
    ex2: { id: 'ex2', kind: 'partner', a: 'ann', b: 'zed', status: 'divorced' },
  };
  const partner = (id) => buildConnectors(rels, row).find((c) => c.relId === id);

  it('neighbours keep a straight line between their centres', () => {
    expect(partner('current').segments).toEqual([[0, 120, 202, 120]]);
  });

  it('a partner beyond another card is joined by a bracket under the row', () => {
    const { segments, marker, points } = partner('ex1');
    const bottom = 120 + HALF_H;
    expect(segments).toHaveLength(3);
    const [, [, runY]] = segments;
    expect(runY).toBeGreaterThan(bottom);
    expect(segments[0]).toEqual([0, bottom, 0, runY]);
    expect(segments[2]).toEqual([404, runY, 404, bottom]);
    expect(marker.y).toBe(runY);
    expect(points).toEqual([0, bottom, 0, runY, 404, runY, 404, bottom]);
  });

  it('skipping more cards goes deeper, so two brackets from one person never share a run', () => {
    expect(partner('ex2').segments[1][1]).toBeGreaterThan(partner('ex1').segments[1][1]);
  });

  it('a click on the straight line between neighbours only finds that line', () => {
    // Midway between Ann and Yan, on the row's centre line.
    const hit = findConnectorAt(buildConnectors(rels, row), 101, 120, 8);
    expect(hit.relId).toBe('current');
  });

  it("a bracketed couple's children hang from the bracket", () => {
    const withChild = {
      ...rels,
      p1: { id: 'p1', kind: 'parent', a: 'ann', b: 'kid', type: 'birth' },
      p2: { id: 'p2', kind: 'parent', a: 'xavi', b: 'kid', type: 'birth' },
    };
    const positions = { ...row, kid: { x: 202, y: 330 } };
    const connectors = buildConnectors(withChild, positions);
    const bracketY = connectors.find((c) => c.relId === 'ex1').segments[1][1];
    const trunk = connectors.find((c) => c.kind === 'parent').segments[0];
    expect(trunk[1]).toBe(bracketY);
  });
});

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
