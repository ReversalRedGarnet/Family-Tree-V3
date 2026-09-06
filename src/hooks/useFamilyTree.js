import { useState, useCallback, useMemo } from 'react';
import { COLOR_THEMES, DEFAULT_GENDER, MAX_HISTORY, ORIGIN_X } from '../utils/constants';
import { computeGenerations } from '../utils/generations';
import { autoLayout, reflowAll, rowY } from '../utils/layout';
import { generateId } from '../utils/id';
import { loadGraph, clearSavedGraph } from '../utils/storage';

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
    // Provisional only: autoLayout runs the slot finder over this card
    // before it is ever rendered. Starting it on the centre line means an
    // unanchored card that finds the centre free stays exactly there.
    position: { x: ORIGIN_X, y: rowY(0) },
  };
}

export function useFamilyTree() {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: loadGraph() || EMPTY_GRAPH,
    future: [],
  }));
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
        // The hint says where the card would LIKE to be — the people it
        // arrives attached to, or an exact spot the user pointed at. Which
        // slot it actually gets is the slot finder's call.
        { hint: { newId: id, anchorIds: opts.anchorIds, x: opts.x } }
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

  // Links an EXISTING person to one or two parents in one step — the
  // drag-a-card-onto-a-parent-line gesture. Kept separate from
  // addRelationship (which only ever writes one link) for the same reason
  // addRelative bundles a new person's links into one commit: adopting into
  // a couple with two parents should be one undo, not two.
  const addParentLinks = useCallback(
    (childId, parentIds) => {
      const prepared = (parentIds || [])
        .filter((parentId) => parentId && parentId !== childId)
        .map((parentId) => ({ id: generateId('rel'), kind: 'parent', a: parentId, b: childId }));
      if (!prepared.length) return [];

      commit((g) => {
        if (!g.people[childId]) return g;
        const relationships2 = { ...g.relationships };
        prepared.forEach((rel) => {
          if (!g.people[rel.a]) return;
          relationships2[rel.id] = rel;
        });
        return { ...g, relationships: relationships2 };
      });

      return prepared.map((rel) => rel.id);
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

  // Swaps in a whole different graph in one step — the "load from Drive"
  // case, where nothing about the current board carries over. One commit,
  // one undo back to whatever was here before, exactly like any other
  // change. Positions are trusted as saved and NOT relaid-out, matching
  // the initial local-storage bootstrap above (`loadGraph()` at hook
  // init, which also goes straight into state with no autoLayout pass) —
  // a Drive-loaded tree should behave exactly like a locally-loaded one,
  // not get a surprise relayout the local path never gets. If anything
  // actually collides, Tidy rows (or the next ordinary edit) resolves it,
  // same as it always would for a tree opened from an older save.
  const replaceGraph = useCallback(
    (graph) => {
      commit(
        () => ({
          people: (graph && graph.people) || {},
          relationships: (graph && graph.relationships) || {},
        }),
        { layout: false }
      );
      setSelectedIds([]);
    },
    [commit]
  );

  // The only thing that overrides a hand-drag, and the only thing that
  // moves cards nobody touched. reflowAll returns a fully positioned graph,
  // so autoLayout would only be second-guessing it.
  //
  // reflowAll always hands back a fresh object — that's what "fully
  // positioned" means, not "changed" — so commit's own reference check
  // can't tell a real re-tidy from a no-op one. Checked here instead: if
  // the tree is already tidy, this is a no-op and shouldn't cost an undo
  // step, the same principle every other commit already gets for free by
  // returning `g` unchanged when there's nothing to do.
  const tidyRows = useCallback(() => {
    commit(
      (g) => {
        const next = reflowAll(g);
        const changed = Object.keys(g.people).some((id) => {
          const before = g.people[id];
          const after = next.people[id];
          return (
            !after ||
            before.placed !== after.placed ||
            before.position?.x !== after.position?.x ||
            before.position?.y !== after.position?.y
          );
        });
        return changed ? next : g;
      },
      { layout: false }
    );
  }, [commit]);

  const resetAll = useCallback(() => {
    commit(() => EMPTY_GRAPH);
    setSelectedIds([]);
    clearSavedGraph();
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
    addParentLinks,
    addPartnerWithLoss,
    deleteRelationship,
    tidyRows,
    resetAll,
    replaceGraph,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
