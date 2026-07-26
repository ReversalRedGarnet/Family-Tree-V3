import { useState, useCallback, useMemo } from 'react';
import {
  SHAPES,
  COLOR_THEMES,
  MAX_HISTORY,
  ROW_HEIGHT,
  TOP_MARGIN,
  CARD_WIDTH,
  COLUMN_GAP,
} from '../utils/constants';
import { computeGenerations } from '../utils/generations';
import { generateId } from '../utils/id';

const EMPTY_GRAPH = { people: {}, relationships: {} };

export function rowY(gen) {
  return TOP_MARGIN + (Number.isFinite(gen) ? gen : 0) * ROW_HEIGHT;
}

// Auto-layout, but never against the user's wishes. A card the user has
// dragged is marked `placed` and is treated as fixed furniture: it keeps its
// exact spot, and auto-placed cards flow around it.
function autoLayout(graph) {
  const { generation } = computeGenerations(graph.people, graph.relationships);
  const people = { ...graph.people };

  // 1. Drop every un-placed card onto its generation's row.
  Object.keys(people).forEach((id) => {
    const person = people[id];
    if (person.placed) return;
    people[id] = {
      ...person,
      position: { x: person.position?.x ?? 0, y: rowY(generation[id]) },
    };
  });

  // 2. Within each row, nudge un-placed cards right so they don't stack.
  const rows = new Map();
  Object.values(people).forEach((person) => {
    const key = Math.round(person.position?.y ?? 0);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(person);
  });

  const minGap = CARD_WIDTH + COLUMN_GAP;
  rows.forEach((row) => {
    row.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    for (let i = 1; i < row.length; i += 1) {
      const prev = row[i - 1];
      const current = row[i];
      const needed = (prev.position?.x ?? 0) + minGap;
      if ((current.position?.x ?? 0) < needed && !current.placed) {
        people[current.id] = { ...current, position: { ...current.position, x: needed } };
        row[i] = people[current.id];
      }
    }
  });

  return { ...graph, people };
}

export function useFamilyTree() {
  const [history, setHistory] = useState({ past: [], present: EMPTY_GRAPH, future: [] });
  const [selectedIds, setSelectedIds] = useState([]);

  const graph = history.present;
  const { people, relationships } = graph;

  const { generation, conflicts } = useMemo(
    () => computeGenerations(people, relationships),
    [people, relationships]
  );

  const commit = useCallback((producer, { layout = true } = {}) => {
    setHistory((h) => {
      const next = producer(h.present);
      if (!next || next === h.present) return h;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: layout ? autoLayout(next) : next,
        future: [],
      };
    });
  }, []);

  // ---------- Selection ----------

  const select = useCallback((id, additive = false) => {
    setSelectedIds((prev) => {
      if (id === null || id === undefined) return [];
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // ---------- People ----------

  const addPerson = useCallback(
    (personData = {}, opts = {}) => {
      const id = generateId('person');
      commit((g) => ({
        ...g,
        people: {
          ...g.people,
          [id]: {
            id,
            firstName: personData.firstName || '',
            lastName: personData.lastName || '',
            gender: personData.gender || 'unspecified',
            birthDate: personData.birthDate || '',
            deathDate: personData.deathDate || '',
            living: personData.living !== false,
            occupation: personData.occupation || '',
            notes: personData.notes || '',
            photo: personData.photo || null,
            shape: personData.shape || SHAPES[0],
            colorTheme: personData.colorTheme || COLOR_THEMES[0].id,
            placed: false,
            position: { x: Math.round(opts.nearX ?? 360), y: rowY(0) },
          },
        },
      }));
      return id;
    },
    [commit]
  );

  const updatePerson = useCallback(
    (id, personData) => {
      commit((g) => {
        if (!g.people[id]) return g;
        return { ...g, people: { ...g.people, [id]: { ...g.people[id], ...personData, id } } };
      });
    },
    [commit]
  );

  const deletePerson = useCallback(
    (id) => {
      commit((g) => {
        if (!g.people[id]) return g;
        const people2 = { ...g.people };
        delete people2[id];
        const relationships2 = {};
        Object.entries(g.relationships).forEach(([rid, rel]) => {
          if (rel.a === id || rel.b === id) return; // link dies with the person
          relationships2[rid] = rel;
        });
        return { people: people2, relationships: relationships2 };
      });
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    },
    [commit]
  );

  // Dragging marks the card as user-placed and skips re-layout, so nothing
  // ever snaps back out from under the cursor.
  const movePerson = useCallback(
    (id, x, y) => {
      commit(
        (g) => {
          if (!g.people[id]) return g;
          return {
            ...g,
            people: {
              ...g.people,
              [id]: { ...g.people[id], placed: true, position: { x, y } },
            },
          };
        },
        { layout: false }
      );
    },
    [commit]
  );

  // ---------- Relationships ----------

  const addRelationship = useCallback(
    (kind, aId, bId, details = {}) => {
      const id = generateId('rel');
      commit((g) => {
        if (!g.people[aId] || !g.people[bId]) return g;
        return {
          ...g,
          relationships: {
            ...g.relationships,
            [id]: { id, kind, a: aId, b: bId, ...details },
          },
        };
      });
      return id;
    },
    [commit]
  );

  const updateRelationship = useCallback(
    (id, details) => {
      commit((g) => {
        if (!g.relationships[id]) return g;
        return {
          ...g,
          relationships: { ...g.relationships, [id]: { ...g.relationships[id], ...details, id } },
        };
      });
    },
    [commit]
  );

  const deleteRelationship = useCallback(
    (id) => {
      commit((g) => {
        if (!g.relationships[id]) return g;
        const relationships2 = { ...g.relationships };
        delete relationships2[id];
        return { ...g, relationships: relationships2 };
      });
    },
    [commit]
  );

  // ---------- Layout / history ----------

  // Releases every card back to auto-layout.
  const tidyRows = useCallback(() => {
    commit((g) => {
      const people2 = {};
      Object.entries(g.people).forEach(([id, person]) => {
        people2[id] = { ...person, placed: false };
      });
      return { ...g, people: people2 };
    });
  }, [commit]);

  const resetAll = useCallback(() => {
    commit(() => EMPTY_GRAPH);
    setSelectedIds([]);
  }, [commit]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future].slice(0, MAX_HISTORY),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: next,
        future: rest,
      };
    });
  }, []);

  return {
    people,
    relationships,
    selectedIds,
    generation,
    conflicts,
    select,
    clearSelection,
    addPerson,
    updatePerson,
    deletePerson,
    movePerson,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    tidyRows,
    resetAll,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
