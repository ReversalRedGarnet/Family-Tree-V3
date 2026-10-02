// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFamilyTree } from './useFamilyTree';

// Two people and a current marriage between them, built through the hook's
// own actions so every step is a real commit.
function setup() {
  const { result } = renderHook(() => useFamilyTree());
  let a;
  let b;
  let relId;
  act(() => {
    a = result.current.addRelative({ firstName: 'Ann' });
  });
  act(() => {
    b = result.current.addRelative({ firstName: 'Bob' });
  });
  act(() => {
    relId = result.current.addRelationship('partner', a, b, { type: 'marriage', status: 'together' });
  });
  return { result, a, b, relId };
}

describe('useFamilyTree.updateRelationship', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("changes a link's details and is undone in one step", () => {
    const { result, relId } = setup();
    act(() => {
      result.current.updateRelationship(relId, { status: 'divorced', endDate: '2015' });
    });
    expect(result.current.relationships[relId]).toMatchObject({ status: 'divorced', endDate: '2015', type: 'marriage' });

    act(() => {
      result.current.undo();
    });
    expect(result.current.relationships[relId].status).toBe('together');
  });

  it('never changes what kind of link it is or who it connects', () => {
    const { result, a, b, relId } = setup();
    act(() => {
      result.current.updateRelationship(relId, { kind: 'sibling', a: 'someone', b: 'else', status: 'separated' });
    });
    expect(result.current.relationships[relId]).toMatchObject({ kind: 'partner', a, b, status: 'separated' });
  });

  it('costs no undo step when nothing actually changes', () => {
    const { result, relId } = setup();
    act(() => {
      result.current.updateRelationship(relId, { status: 'together' });
    });
    // The one undo available is still the link's own creation.
    act(() => {
      result.current.undo();
    });
    expect(result.current.relationships[relId]).toBeUndefined();
  });

  it('marks the deceased partner in the same commit as a widowed status', () => {
    const { result, b, relId } = setup();
    act(() => {
      result.current.updateRelationship(relId, { status: 'widowed' }, b);
    });
    expect(result.current.people[b].living).toBe(false);
    expect(result.current.relationships[relId].status).toBe('widowed');

    act(() => {
      result.current.undo();
    });
    expect(result.current.people[b].living).toBe(true);
    expect(result.current.relationships[relId].status).toBe('together');
  });
});

describe('useFamilyTree drops', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps a dropped card at the exact x, on its row, through later unrelated edits', () => {
    const { result, a, b } = setup();
    const row = result.current.people[a].position.y;
    act(() => {
      result.current.movePerson(a, 1234.5);
    });
    expect(result.current.people[a].position).toEqual({ x: 1234.5, y: row });

    act(() => {
      result.current.updatePerson(b, { firstName: 'Robert' });
    });
    act(() => {
      result.current.addRelative({ firstName: 'Cy' });
    });
    expect(result.current.people[a].position).toEqual({ x: 1234.5, y: row });
  });

  it('moves only the dropped card when it lands overlapping someone', () => {
    const { result, a, b } = setup();
    const bBefore = result.current.people[b].position.x;
    act(() => {
      result.current.movePerson(a, bBefore + 20);
    });
    expect(result.current.people[b].position.x).toBe(bBefore);
    expect(Math.abs(result.current.people[a].position.x - bBefore)).toBeGreaterThanOrEqual(158);
  });

  it('writes nothing when a card is dropped back where it already rests', () => {
    const { result, a, relId } = setup();
    act(() => {
      result.current.movePerson(a, 2000);
    });
    act(() => {
      result.current.movePerson(a, 2000);
    });
    // One undo reverses the real move; the second undo is the link itself.
    act(() => {
      result.current.undo();
    });
    expect(result.current.people[a].position.x).not.toBe(2000);
    act(() => {
      result.current.undo();
    });
    expect(result.current.relationships[relId]).toBeUndefined();
  });
});

describe('undo hygiene (M7, L6)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saving a person unchanged adds no undo step', () => {
    const { result, a, relId } = setup();
    const ann = result.current.people[a];
    act(() => {
      result.current.updatePerson(a, { firstName: ann.firstName, lastName: '', notes: undefined });
    });
    // The next undo takes back the last real change (the marriage), not a no-op save.
    act(() => {
      result.current.undo();
    });
    expect(result.current.relationships[relId]).toBeUndefined();
  });

  it('a real edit is still one undo step', () => {
    const { result, a } = setup();
    act(() => {
      result.current.updatePerson(a, { occupation: 'Pilot' });
    });
    expect(result.current.people[a].occupation).toBe('Pilot');
    act(() => {
      result.current.undo();
    });
    expect(result.current.people[a].occupation ?? '').toBe('');
  });

  it('deleting many people is one commit, so one undo restores them all, even past 50', () => {
    const { result } = renderHook(() => useFamilyTree());
    const ids = [];
    for (let i = 0; i < 60; i += 1) {
      act(() => {
        ids.push(result.current.addRelative({ firstName: `P${i}` }));
      });
    }
    act(() => {
      result.current.selectMany(ids);
    });
    act(() => {
      result.current.deleteMany(ids);
    });
    expect(Object.keys(result.current.people)).toHaveLength(0);
    expect(result.current.selectedIds).toEqual([]);

    act(() => {
      result.current.undo();
    });
    expect(Object.keys(result.current.people)).toHaveLength(60);
  });

  it('deleteMany removes every link touching the deleted people', () => {
    const { result, a, b } = setup();
    let c;
    act(() => {
      c = result.current.addRelative({ firstName: 'Cy' }, (id) => [{ kind: 'parent', a, b: id }]);
    });
    act(() => {
      result.current.deleteMany([a, b]);
    });
    expect(Object.keys(result.current.people)).toEqual([c]);
    expect(result.current.relationships).toEqual({});
  });
});
