// Saves the tree to this browser only — no account, no server, no sync
// across devices. That's the entire scope of "local save": surviving a
// refresh or an accidentally closed tab, nothing more. Export is still the
// only way to get a copy that outlives this browser's storage.

const STORAGE_KEY = 'family-tree/graph/v1';

// Bumped only if the saved shape ever needs to change incompatibly. A
// version that doesn't match what this build expects is treated as if
// nothing were saved, rather than risking a half-understood load.
const VERSION = 1;

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Some browsers throw just for touching localStorage in certain modes
    // (e.g. cookies blocked in an iframe), not only for being unavailable.
    return false;
  }
}

// Drops any relationship whose `a` or `b` doesn't point at a person that
// actually exists in `people`. The rest of the app already tolerates a
// dangling reference gracefully wherever one gets READ (every consumer of
// `relationships` guards on the people it points to actually being there —
// connectors.js skips the line, generations.js skips the edge, the various
// name-lookups fall back to "Someone"), but nothing repairs the underlying
// data, so the rot would otherwise ride along forever, re-saved on every
// autosave. A browser crash mid-write, a bug elsewhere, or someone poking
// at localStorage by hand can all leave this behind — this is the one
// place it's cleaned up, once, at load.
function dropDanglingRelationships(people, relationships) {
  const clean = {};
  let droppedCount = 0;
  Object.entries(relationships).forEach(([id, rel]) => {
    if (rel && typeof rel === 'object' && people[rel.a] && people[rel.b]) {
      clean[id] = rel;
    } else {
      droppedCount += 1;
    }
  });
  return { relationships: clean, droppedCount };
}

export function loadGraph() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return null;
    const people = parsed.people && typeof parsed.people === 'object' ? parsed.people : {};
    const relationshipsRaw =
      parsed.relationships && typeof parsed.relationships === 'object' ? parsed.relationships : {};
    const { relationships, droppedCount } = dropDanglingRelationships(people, relationshipsRaw);
    return { people, relationships, droppedCount };
  } catch {
    // Corrupted JSON, a tampered value, whatever — never let a bad save
    // stop the app from opening. It just opens empty, same as a first visit.
    return null;
  }
}

export function saveGraph(graph) {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, people: graph.people, relationships: graph.relationships })
    );
    return true;
  } catch {
    // Storage full, disabled, or private-browsing quirks. Silent on
    // purpose per call — the caller decides whether and how often to warn,
    // since a toast on every keystroke-triggered save would be exhausting.
    return false;
  }
}

export function clearSavedGraph() {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if removal itself fails — there's no more-defensive
    // fallback than "don't crash the reset".
  }
}
