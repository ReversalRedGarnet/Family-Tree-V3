import { wouldCreateCycle, parentsOf } from './generations';
import { getPersonDateWarnings, getParentChildAgeWarnings } from './dates';

const unordered = (rel, x, y) =>
  (rel.a === x && rel.b === y) || (rel.a === y && rel.b === x);

// The only blocking rules left are the ones that would make the tree
// self-contradictory. Everything else — no parents yet, no partner, a child
// with a single parent — is allowed, because none of that is an error.
export function validateRelationship(kind, aId, bId, people, relationships) {
  if (!aId || !bId) return { ok: false, error: 'Pick two people first.' };
  if (aId === bId) return { ok: false, error: "You can't link someone to themselves." };
  if (!people[aId] || !people[bId]) {
    return { ok: false, error: 'One of those people is no longer on the board.' };
  }

  const existing = Object.values(relationships).find((rel) => {
    if (rel.kind !== kind) return false;
    return kind === 'parent'
      ? rel.a === aId && rel.b === bId
      : unordered(rel, aId, bId);
  });
  if (existing) {
    return { ok: false, error: 'These two already have that link.' };
  }

  if (kind === 'parent') {
    if (wouldCreateCycle(aId, bId, people, relationships)) {
      return { ok: false, error: 'That would make someone their own ancestor.' };
    }
  }

  if (kind === 'partner') {
    // A direct parent/child pairing can't also be a partnership — the two
    // constraints contradict each other and the row layout breaks.
    const parentLink = Object.values(relationships).find(
      (rel) => rel.kind === 'parent' && unordered(rel, aId, bId)
    );
    if (parentLink) {
      return { ok: false, error: 'These two are already parent and child.' };
    }
  }

  if (kind === 'sibling') {
    const parentLink = Object.values(relationships).find(
      (rel) => rel.kind === 'parent' && unordered(rel, aId, bId)
    );
    if (parentLink) {
      return { ok: false, error: 'These two are already parent and child.' };
    }
  }

  return { ok: true };
}

export function describeDeleteImpact(personId, people, relationships) {
  const links = Object.values(relationships).filter(
    (rel) => rel.a === personId || rel.b === personId
  );
  const children = links.filter((rel) => rel.kind === 'parent' && rel.a === personId).length;
  return { linkCount: links.length, childCount: children };
}

// ---- Duplicate detection ----
// Catches the accidental second copy of someone already on the board.
//
// Only fires on an exact match of the identifying fields, and only when
// there's a real name to match on — otherwise every half-filled "Unnamed"
// card would collide with every other one. Same name but a different
// birth year is a grandparent and grandchild sharing a name, which is
// common and entirely legitimate, so that isn't treated as a duplicate.

const squash = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function findDuplicatePerson(data, people, excludeId = null) {
  const first = squash(data?.firstName);
  const last = squash(data?.lastName);
  if (!first && !last) return null; // nothing to match on

  const birth = squash(data?.birthYear);
  const gender = squash(data?.gender);

  const match = Object.values(people).find((person) => {
    if (!person || person.id === excludeId) return false;
    return (
      squash(person.firstName) === first &&
      squash(person.lastName) === last &&
      squash(person.birthYear) === birth &&
      squash(person.gender) === gender
    );
  });

  return match || null;
}

// ---- Non-blocking warnings ----
// Surfaced quietly in the sidebar. None of this ever stops a save.
export function collectTreeWarnings(people, relationships) {
  const warnings = [];
  const note = (person, message) =>
    warnings.push({
      personId: person.id,
      name: `${person.firstName} ${person.lastName}`.trim() || 'Unnamed',
      message,
    });

  Object.values(people).forEach((person) => {
    getPersonDateWarnings(person).forEach((message) => note(person, message));

    const parents = parentsOf(person.id, relationships).map((id) => people[id]).filter(Boolean);
    getParentChildAgeWarnings(person, parents[0], parents[1]).forEach((message) =>
      note(person, message)
    );
  });

  return warnings;
}
