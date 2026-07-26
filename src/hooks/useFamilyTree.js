import { useState, useCallback, useMemo } from 'react';
import { COLOR_THEMES, DEFAULT_GENDER, MAX_HISTORY } from '../utils/constants';
import { computeGenerations } from '../utils/generations';
import { autoLayout, rowY } from '../utils/layout';
import { generateId } from '../utils/id';

const EMPTY_GRAPH = { people: {}, relationships: {} };

function blankPerson(id, data = {}) {
  return {
    id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    additionalNames: data.additionalNames || '',
    gender: data.gender || DEFAULT_GENDER,
    birthYear: data.birthYear || '',
    deathYear: data.deathYear || '',
    living: data.living !== false,
    occupation: data.occupation || '',
    notes: data.notes || '',
    colorTheme: data.colorTheme || COLOR_THEMES[0].id,
    placed: false,
    placedGen: 0,
    position: { x: 360, y: rowY(0) },
  };
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

  const commit = useCallback((producer, { layout = true, hint = null } = {}) => {
    setHistory((h) => {
      const next = producer(h.present);
      if (!next || next === h.present) return h;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: layout ? autoLayout(next, hint) : next,
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

  // Adds a person and every link they arrive with in ONE step, so the new
  // card is positioned knowing who it's related to — and so it's a single
  // undo, not three.
  const addRelative = useCallback(
    (personData = {}, buildLinks = null, opts = {}) => {
      const id = generateId('person');

      // Ids are generated out here on purpose: a setState updater has to be
      // pure, and React re-runs it in development.
      const requested =
        (typeof buildLinks === 'function' ? buildLinks(id) : buildLinks) || [];
      const prepared = requested
        .filter((link) => link && link.kind && link.a && link.b && link.a !== link.b)
        .map((link) => ({
          id: generateId('rel'),
          kind: link.kind,
          a: link.a,
          b: link.b,
          ...(link.details || {}),
        }));

      commit(
        (g) => {
          const relationships2 = { ...g.relationships };
          prepared.forEach((rel) => {
            if (rel.a !== id && !g.people[rel.a]) return;
            if (rel.b !== id && !g.people[rel.b]) return;
            relationships2[rel.id] = rel;
          });
          return {
            people: { ...g.people, [id]: blankPerson(id, personData) },
            relationships: relationships2,
          };
        },
        { hint: { newId: id, anchorId: opts.anchorId, prefer: opts.prefer, x: opts.nearX } }
      );

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
          if (rel.a === id || rel.b === id) return;
          relationships2[rid] = rel;
        });
        return { people: people2, relationships: relationships2 };
      });
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    },
    [commit]
  );

  const movePerson = useCallback(
    (id, x, y) => {
      commit(
        (g) => {
          if (!g.people[id]) return g;
          return {
            ...g,
            people: { ...g.people, [id]: { ...g.people[id], placed: true, position: { x, y } } },
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
          relationships: { ...g.relationships, [id]: { id, kind, a: aId, b: bId, ...details } },
        };
      });
      return id;
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

  // Links a person and marks the right one deceased in a single step, so
  // "widowed" can't leave the tree in a half-stated condition.
  const addPartnerWithLoss = useCallback(
    (aId, bId, details, deceasedId) => {
      const relId = generateId('rel');
      commit((g) => {
        if (!g.people[aId] || !g.people[bId]) return g;
        const people2 = { ...g.people };
        if (deceasedId && people2[deceasedId]) {
          people2[deceasedId] = { ...people2[deceasedId], living: false };
        }
        return {
          people: people2,
          relationships: {
            ...g.relationships,
            [relId]: { id: relId, kind: 'partner', a: aId, b: bId, ...details },
          },
        };
      });
      return relId;
    },
    [commit]
  );

  // ---------- Layout / history ----------

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
    addRelative,
    updatePerson,
    deletePerson,
    movePerson,
    addRelationship,
    addPartnerWithLoss,
    deleteRelationship,
    tidyRows,
    resetAll,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
