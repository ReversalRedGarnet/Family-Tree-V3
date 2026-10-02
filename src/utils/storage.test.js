import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGraph, saveGraph, sanitizeGraph, moveSaveAside, readRawSave, SAVE_VERSION } from './storage';
import { ORIGIN_X, TOP_MARGIN } from './constants';

const KEY = 'family-tree/graph/v1';

// A Map-backed stand-in for window.localStorage. `failWrites` makes every
// setItem throw the way a full quota does.
function fakeStorage({ failWrites = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new DOMException('full', 'QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

let storage;
const backupKeys = () => [...storage.map.keys()].filter((k) => k.startsWith(`${KEY}/backup-`));

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sanitizeGraph', () => {
  it('drops entries that are not objects and counts them', () => {
    const out = sanitizeGraph({ people: { a: null, b: 'oops', c: [], d: { firstName: 'D' } }, relationships: {} });
    expect(Object.keys(out.people)).toEqual(['d']);
    expect(out.droppedCount).toBe(3);
  });

  it('fills in missing fields so rendering can rely on them', () => {
    const { people } = sanitizeGraph({ people: { a: { birthYear: 1950 } }, relationships: {} });
    expect(people.a).toMatchObject({
      id: 'a',
      firstName: '',
      lastName: '',
      birthYear: '1950',
      living: true,
      placed: false,
      position: { x: ORIGIN_X, y: TOP_MARGIN },
    });
    expect(typeof people.a.gender).toBe('string');
  });

  it('keeps a valid position and a hand-placed flag, but not a placed flag without a position', () => {
    const { people } = sanitizeGraph({
      people: {
        a: { position: { x: 10, y: 20 }, placed: true },
        b: { position: { x: 'x', y: 20 }, placed: true },
      },
      relationships: {},
    });
    expect(people.a.position).toEqual({ x: 10, y: 20 });
    expect(people.a.placed).toBe(true);
    expect(people.b.placed).toBe(false);
  });

  it('takes the id from the key, not from the record', () => {
    const { people } = sanitizeGraph({ people: { a: { id: 'other' } }, relationships: {} });
    expect(people.a.id).toBe('a');
  });

  it('accepts an array of people keyed by their own id', () => {
    const { people } = sanitizeGraph({ people: [{ id: 'a', firstName: 'A' }, { firstName: 'no id' }], relationships: {} });
    expect(Object.keys(people)).toEqual(['a']);
  });

  it('drops dangling, self-linked, kindless and non-object relationships', () => {
    const out = sanitizeGraph({
      people: { a: {}, b: {} },
      relationships: {
        ok: { kind: 'partner', a: 'a', b: 'b' },
        dangling: { kind: 'parent', a: 'a', b: 'ghost' },
        self: { kind: 'sibling', a: 'a', b: 'a' },
        kindless: { a: 'a', b: 'b' },
        nul: null,
      },
    });
    expect(Object.keys(out.relationships)).toEqual(['ok']);
    expect(out.droppedCount).toBe(4);
  });

  it('keeps unknown extra fields rather than throwing them away', () => {
    const { people } = sanitizeGraph({ people: { a: { futureField: 42 } }, relationships: {} });
    expect(people.a.futureField).toBe(42);
  });

  it('treats a non-object input as an empty graph', () => {
    expect(sanitizeGraph(null)).toEqual({ people: {}, relationships: {}, droppedCount: 0 });
    expect(sanitizeGraph('x')).toEqual({ people: {}, relationships: {}, droppedCount: 0 });
  });
});

describe('loadGraph', () => {
  it('reports empty when nothing is saved', () => {
    expect(loadGraph()).toEqual({ status: 'empty' });
  });

  it('round-trips a saved graph', () => {
    saveGraph({ people: { a: { id: 'a', firstName: 'A', position: { x: 1, y: 2 } } }, relationships: {} });
    const out = loadGraph();
    expect(out.status).toBe('ok');
    expect(out.people.a.firstName).toBe('A');
    expect(out.droppedCount).toBe(0);
  });

  it('keeps an unreadable save aside under a backup key and leaves the original in place', () => {
    const raw = '{"version":1,"people":{"a":';
    storage.setItem(KEY, raw);
    const out = loadGraph();
    expect(out.status).toBe('unreadable');
    expect(out.raw).toBe(raw);
    expect(storage.getItem(out.backupKey)).toBe(raw);
    expect(storage.getItem(KEY)).toBe(raw);
  });

  it('never loads a save from a different version, and backs it up', () => {
    const raw = JSON.stringify({ version: SAVE_VERSION + 1, people: { a: { firstName: 'Kept' } }, relationships: {} });
    storage.setItem(KEY, raw);
    const out = loadGraph();
    expect(out.status).toBe('unsupported-version');
    expect(storage.getItem(out.backupKey)).toBe(raw);
  });

  it('writes one backup per distinct broken save, however often it is reloaded', () => {
    storage.setItem(KEY, 'not json');
    loadGraph();
    loadGraph();
    expect(backupKeys()).toHaveLength(1);
  });

  it('reports a null backup key when even the copy cannot be written', () => {
    const full = fakeStorage({ failWrites: true });
    full.map.set(KEY, 'not json');
    vi.stubGlobal('window', { localStorage: full });
    const out = loadGraph();
    expect(out.status).toBe('unreadable');
    expect(out.backupKey).toBeNull();
  });

  it('loads a save containing a null person without it reaching the caller', () => {
    storage.setItem(KEY, JSON.stringify({ version: 1, people: { a: null, b: { firstName: 'B' } }, relationships: {} }));
    const out = loadGraph();
    expect(out.status).toBe('ok');
    expect(Object.keys(out.people)).toEqual(['b']);
    expect(out.droppedCount).toBe(1);
  });
});

describe('moveSaveAside', () => {
  it('copies the save to a backup key, then removes it', () => {
    storage.setItem(KEY, 'whatever');
    expect(moveSaveAside()).toBe(true);
    expect(readRawSave()).toBeNull();
    expect(backupKeys().map((k) => storage.getItem(k))).toEqual(['whatever']);
  });

  it('refuses to remove the save when the copy fails, unless forced', () => {
    const full = fakeStorage({ failWrites: true });
    full.map.set(KEY, 'precious');
    vi.stubGlobal('window', { localStorage: full });
    expect(moveSaveAside()).toBe(false);
    expect(full.getItem(KEY)).toBe('precious');
    expect(moveSaveAside({ force: true })).toBe(true);
    expect(full.getItem(KEY)).toBeNull();
  });
});
