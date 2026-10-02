import { useState, useCallback, useMemo, useRef } from 'react';
import { COLOR_THEMES, DEFAULT_GENDER, MAX_HISTORY, ORIGIN_X } from '../utils/constants';
import { computeGenerations } from '../utils/generations';
import { autoLayout, reflowAll, rowY, settleDroppedX } from '../utils/layout';
import { generateId } from '../utils/id';
import { loadGraph, clearSavedGraph } from '../utils/storage';
import { applyCommit } from '../utils/history';

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

// A hand drop: the card keeps exactly the x it was dropped at (unless that
// overlaps someone in its row, in which case only this card is nudged clear
// -- see settleDroppedX) and always sits on its own generation's row.
// Returns the same object when nothing would change, so dropping a card
// back where it already was writes nothing.
function placeDropped(people, generation, id, x) {
  const gen = generation[id] ?? 0;
  const settledX = settleDroppedX(people, generation, id, x);
  const person = people[id];
  if (person.placed && person.placedGen === gen && person.position?.x === settledX && person.position?.y === rowY(gen)) {
    return person;
  }
  return { ...person, placed: true, placedGen: gen, position: { x: settledX, y: rowY(gen) } };
}

export function useFamilyTree() {
  // Read once, at mount -- a ref rather than two separate lazy useState
  // initializers, since loadGraph() itself does real work (a localStorage
  // read, a JSON.parse, and a pass repairing dangling relationships) that
  // history's own initializer and loadRepairedCount's both otherwise ran
  // independently, duplicating all of it for no reason.
  const loadedRef = useRef();
  if (loadedRef.current === undefined) loadedRef.current = loadGraph();

  const [history, setHistory] = useState(() => {
    const loaded = loadedRef.current;
    return {
      past: [],
      present:
        loaded.status === 'ok' ? { people: loaded.people, relationships: loaded.relationships } : EMPTY_GRAPH,
      future: [],
    };
  });
  // How many people/relationships loadGraph() had to drop as unusable --
  // read once, at mount, purely so App.jsx can surface a one-time toast; it
  // plays no further part in the graph itself.
  const [loadRepairedCount] = useState(() => loadedRef.current.droppedCount || 0);
  // Set when the save in this browser couldn't be used at all (unreadable,
  // or written by a different version). The board starts empty, and App.jsx
  // must not autosave over the original until it's safe to -- see there.
  const [loadIssue] = useState(() => {
    const { status, raw, backupKey } = loadedRef.current;
    return status === 'unreadable' || status === 'unsupported-version' ? { status, raw, backupKey } : null;
  });
  const [selectedIds, setSelectedIds] = useState([]);

  const graph = history.present;
  const { people, relationships } = graph;

  const { generation, conflicts } = useMemo(
    () => computeGenerations(people, relationships),
    [people, relationships]
  );

  const commit = useCallback((producer, { layout = true, hint = null, history = true } = {}) => {
    setHistory((h) => {
      const next = producer(h.present);
      if (!next || next === h.present) return h;
      const present = layout ? autoLayout(next, hint) : next;
      return applyCommit(h, present, { history });
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

  // Replaces the whole selection at once — the marquee (drag-box) gesture,
  // which has no notion of "additive" the way a shift-click does.
  const selectMany = useCallback((ids) => setSelectedIds([...new Set(ids)]), []);

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

  // Saving the form without changing anything is not an edit, so it costs
  // no undo step. An empty field and a missing one count as the same.
  const updatePerson = useCallback(
    (id, personData) => {
      commit((g) => {
        const current = g.people[id];
        if (!current) return g;
        const changed = Object.keys(personData).some(
          (key) => key !== 'id' && (current[key] ?? '') !== (personData[key] ?? '')
        );
        if (!changed) return g;
        return { ...g, people: { ...g.people, [id]: { ...current, ...personData, id } } };
      });
    },
    [commit]
  );

  // Removes several people and all their links in ONE commit: one undo
  // brings everyone back, however many were selected. (One commit each
  // used to push the start state out of the 50-step history past 50.)
  const deleteMany = useCallback(
    (ids) => {
      const doomed = new Set(ids);
      commit((g) => {
        if (![...doomed].some((id) => g.people[id])) return g;
        const people2 = {};
        Object.entries(g.people).forEach(([pid, person]) => {
          if (!doomed.has(pid)) people2[pid] = person;
        });
        const relationships2 = {};
        Object.entries(g.relationships).forEach(([rid, rel]) => {
          if (doomed.has(rel.a) || doomed.has(rel.b)) return;
          relationships2[rid] = rel;
        });
        return { people: people2, relationships: relationships2 };
      });
      setSelectedIds((prev) => prev.filter((sid) => !doomed.has(sid)));
    },
    [commit]
  );

  const deletePerson = useCallback((id) => deleteMany([id]), [deleteMany]);

  const movePerson = useCallback(
    (id, x) => {
      commit(
        (g) => {
          if (!g.people[id]) return g;
          const { generation: gens } = computeGenerations(g.people, g.relationships);
          const moved = placeDropped(g.people, gens, id, x);
          if (moved === g.people[id]) return g;
          return { ...g, people: { ...g.people, [id]: moved } };
        },
        { layout: false }
      );
    },
    [commit]
  );

  // Dragging one card out of a multi-selection moves the whole group —
  // everyone's relative positions stay as they were (each card only nudged
  // if it lands on someone outside the group), and it's a single undo step,
  // not one per person.
  const moveMany = useCallback(
    (positionsById) => {
      commit(
        (g) => {
          const entries = Object.entries(positionsById)
            .filter(([id]) => g.people[id])
            .sort(([, p], [, q]) => p.x - q.x);
          if (!entries.length) return g;
          const { generation: gens } = computeGenerations(g.people, g.relationships);
          // Every moved card is put at its new x first, so the group is
          // checked against its own new positions, never its old ones.
          const people2 = { ...g.people };
          entries.forEach(([id, pos]) => {
            people2[id] = { ...people2[id], position: { ...people2[id].position, x: pos.x } };
          });
          let changed = false;
          entries.forEach(([id, pos]) => {
            const moved = placeDropped(people2, gens, id, pos.x);
            const before = g.people[id];
            if (moved.position.x !== before.position?.x || moved.position.y !== before.position?.y || !before.placed) {
              changed = true;
            }
            people2[id] = moved;
          });
          return changed ? { ...g, people: people2 } : g;
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

  // Writes several relationships in ONE commit — the general form of what
  // addRelative already does for a brand-new person's links, and what
  // addParentLinks below does for adopting an existing person into a
  // couple. Any batch of relationships that should stand or fall (and
  // undo) together goes through here, rather than each getting its own
  // addRelationship call and its own history entry.
  const addRelationshipBatch = useCallback(
    (rels) => {
      const prepared = (rels || [])
        .filter((r) => r && r.kind && r.a && r.b && r.a !== r.b)
        .map((r) => ({ id: generateId('rel'), kind: r.kind, a: r.a, b: r.b, ...(r.details || {}) }));
      if (!prepared.length) return [];

      commit((g) => {
        const relationships2 = { ...g.relationships };
        let wrote = false;
        prepared.forEach((rel) => {
          if (!g.people[rel.a] || !g.people[rel.b]) return;
          relationships2[rel.id] = rel;
          wrote = true;
        });
        return wrote ? { ...g, relationships: relationships2 } : g;
      });

      return prepared.map((rel) => rel.id);
    },
    [commit]
  );

  // Links an EXISTING person to one or two parents in one step — the
  // drag-a-card-onto-a-parent-line gesture. A thin wrapper around
  // addRelationshipBatch for the one relationship shape it always writes.
  const addParentLinks = useCallback(
    (childId, parentIds) =>
      addRelationshipBatch(
        (parentIds || [])
          .filter((parentId) => parentId && parentId !== childId)
          .map((parentId) => ({ kind: 'parent', a: parentId, b: childId }))
      ),
    [addRelationshipBatch]
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

  // Edits an existing link's own details -- a partnership's type, status or
  // years, a parent or sibling link's type, an "other" link's label. Who it
  // connects and what kind of link it is never change here (that's a
  // different link, so delete and re-add). Marking someone deceased for a
  // "widowed" status lands in the same commit, as addPartnerWithLoss does.
  // Nothing actually changing costs no undo step.
  const updateRelationship = useCallback(
    (id, patch, deceasedId = null) => {
      commit(
        (g) => {
          const rel = g.relationships[id];
          if (!rel) return g;
          const next = { ...rel, ...patch, id: rel.id, kind: rel.kind, a: rel.a, b: rel.b };
          const relChanged = Object.keys(next).some((key) => next[key] !== rel[key]);
          const markDeceased = Boolean(deceasedId && g.people[deceasedId] && g.people[deceasedId].living !== false);
          if (!relChanged && !markDeceased) return g;
          return {
            people: markDeceased ? { ...g.people, [deceasedId]: { ...g.people[deceasedId], living: false } } : g.people,
            relationships: relChanged ? { ...g.relationships, [id]: next } : g.relationships,
          };
        },
        // Nothing here changes anyone's generation, so there's nothing to lay out.
        { layout: false }
      );
    },
    [commit]
  );

  // ---------- Layout / history ----------

  // Swaps in a whole different graph in one step — the "load from Drive"
  // case, where nothing about the current board carries over. Positions are
  // trusted as saved and NOT relaid-out, matching the initial local-storage
  // bootstrap above (`loadGraph()` at hook init, which also goes straight
  // into state with no autoLayout pass) — a Drive-loaded tree should behave
  // exactly like a locally-loaded one, not get a surprise relayout the
  // local path never gets. If anything actually collides, Tidy rows (or the
  // next ordinary edit) resolves it, same as it always would for a tree
  // opened from an older save.
  //
  // `history: false` is for a SILENT load only — Drive's sign-in handshake
  // pulling down a tree because this device had nothing to lose, with no
  // choice the person actually made. That shouldn't become an undo step: an
  // undo that reaches back through it would immediately re-trigger the
  // autosync push and silently overwrite what was just pulled down, over
  // something the user never did. The explicit conflict-resolution case
  // (the person picked "keep this device" or "use Drive's version") keeps
  // the default — one commit, one undo back to whatever was here before —
  // exactly like any other change, matching the README's "Undo reaches
  // back through that choice" claim.
  const replaceGraph = useCallback(
    (graph, { history = true } = {}) => {
      commit(
        () => ({
          people: (graph && graph.people) || {},
          relationships: (graph && graph.relationships) || {},
        }),
        { layout: false, history }
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
    loadRepairedCount,
    loadIssue,
    selectedIds,
    generation,
    conflicts,
    select,
    selectMany,
    clearSelection,
    addRelative,
    updatePerson,
    deletePerson,
    deleteMany,
    movePerson,
    moveMany,
    addRelationship,
    addRelationshipBatch,
    addParentLinks,
    addPartnerWithLoss,
    updateRelationship,
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
