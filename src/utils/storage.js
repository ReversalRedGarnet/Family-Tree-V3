// Saves the tree to this browser only — no account, no server, no sync
// across devices. That's the entire scope of "local save": surviving a
// refresh or an accidentally closed tab, nothing more. Export is still the
// only way to get a copy that outlives this browser's storage.
import { COLOR_THEMES, DEFAULT_GENDER, ORIGIN_X, TOP_MARGIN } from './constants';

const STORAGE_KEY = 'family-tree/graph/v1';
const BACKUP_PREFIX = `${STORAGE_KEY}/backup-`;

// Bumped only if the saved shape ever needs to change incompatibly. A save
// with a different version is never loaded half-understood — it's kept
// aside under a backup key instead (see loadGraph).
export const SAVE_VERSION = 1;

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Some browsers throw just for touching localStorage in certain modes
    // (e.g. cookies blocked in an iframe), not only for being unavailable.
    return false;
  }
}

// ---- Sanitising ----
//
// Everything that reaches state from outside (this browser's save, or a file
// on Drive) goes through here first. Rendering assumes every person is an
// object with string names and a numeric position; one `null` entry used to
// crash the board on every load, with no way back short of clearing site
// data. Unknown extra fields are kept, so nothing written by a newer build is
// thrown away just because this one doesn't use it.

const STRING_FIELDS = ['firstName', 'lastName', 'additionalNames', 'birthYear', 'deathYear', 'occupation', 'notes'];

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asString = (value) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

function sanitizePerson(id, raw) {
  if (!isRecord(raw)) return null;
  const person = { ...raw, id };
  STRING_FIELDS.forEach((field) => {
    person[field] = asString(raw[field]);
  });
  person.gender = typeof raw.gender === 'string' && raw.gender ? raw.gender : DEFAULT_GENDER;
  person.colorTheme = typeof raw.colorTheme === 'string' && raw.colorTheme ? raw.colorTheme : COLOR_THEMES[0].id;
  person.living = raw.living !== false;

  const x = raw.position?.x;
  const y = raw.position?.y;
  const hasPosition = Number.isFinite(x) && Number.isFinite(y);
  person.position = hasPosition ? { x, y } : { x: ORIGIN_X, y: TOP_MARGIN };
  person.placed = hasPosition && raw.placed === true;
  person.placedGen = Number.isFinite(raw.placedGen) ? raw.placedGen : 0;
  return person;
}

// `raw` is anything shaped roughly like { people, relationships }. Returns a
// graph that's safe to render, plus how many people and relationships had to
// be dropped to get there — a relationship pointing at someone who doesn't
// exist, a self-link, or an entry that isn't an object at all.
export function sanitizeGraph(raw) {
  const rawPeople = isRecord(raw) ? raw.people : null;
  const rawRelationships = isRecord(raw) ? raw.relationships : null;
  let droppedCount = 0;

  // An array of people (keyed by their own `id`) is accepted too; anything
  // else that isn't an object map counts as nothing saved.
  const peopleEntries = Array.isArray(rawPeople)
    ? rawPeople.map((p) => [isRecord(p) && typeof p.id === 'string' ? p.id : null, p])
    : isRecord(rawPeople)
      ? Object.entries(rawPeople)
      : [];

  const people = {};
  peopleEntries.forEach(([id, value]) => {
    const person = id ? sanitizePerson(id, value) : null;
    if (person) people[id] = person;
    else droppedCount += 1;
  });

  const relationships = {};
  Object.entries(isRecord(rawRelationships) ? rawRelationships : {}).forEach(([id, rel]) => {
    if (isRecord(rel) && typeof rel.kind === 'string' && people[rel.a] && people[rel.b] && rel.a !== rel.b) {
      relationships[id] = { ...rel, id };
    } else {
      droppedCount += 1;
    }
  });

  return { people, relationships, droppedCount };
}

// ---- Keeping an unreadable save aside ----

// Same content, same key: reloading a broken save again and again keeps ONE
// copy rather than filling storage with duplicates, and never overwrites a
// different backup.
function contentHash(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// Returns the backup key, or null if the copy couldn't be written (most
// likely because storage is full — the copy is as big as the original).
function backupRawSave(raw) {
  const key = `${BACKUP_PREFIX}${contentHash(raw)}`;
  try {
    window.localStorage.setItem(key, raw);
    return key;
  } catch {
    return null;
  }
}

function keptAside(status, raw) {
  return { status, raw, backupKey: backupRawSave(raw) };
}

// What's in this browser, and whether it can be used:
//   { status: 'empty' }
//   { status: 'ok', people, relationships, droppedCount }
//   { status: 'unreadable' | 'unsupported-version', raw, backupKey }
// The last two never load anything: the board starts empty, the original
// text is copied to `backupKey` (null if even that failed), and it's up to
// the caller not to save over the original until it's safe to.
export function loadGraph() {
  if (!hasStorage()) return { status: 'empty' };
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return keptAside('unreadable', raw);
  }
  if (!isRecord(parsed)) return keptAside('unreadable', raw);
  if (parsed.version !== SAVE_VERSION) return keptAside('unsupported-version', raw);

  return { status: 'ok', ...sanitizeGraph(parsed) };
}

export function saveGraph(graph) {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SAVE_VERSION, people: graph.people, relationships: graph.relationships })
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

// ---- Recovery (used by the error screen) ----

// The saved text exactly as stored, readable or not — null if there's none.
export function readRawSave() {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Moves the current save out of the way so the next load starts empty. It's
// copied to a backup key first and only removed once that copy exists —
// unless `force` is set, which the caller only does after the person has
// already downloaded their own copy. Returns false if nothing was moved.
export function moveSaveAside({ force = false } = {}) {
  const raw = readRawSave();
  if (!raw) return true;
  if (!backupRawSave(raw) && !force) return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function downloadRawSave(raw) {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `family-tree-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
