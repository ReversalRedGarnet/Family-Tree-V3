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

export function loadGraph() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return null;
    const people = parsed.people && typeof parsed.people === 'object' ? parsed.people : {};
    const relationships =
      parsed.relationships && typeof parsed.relationships === 'object' ? parsed.relationships : {};
    return { people, relationships };
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
