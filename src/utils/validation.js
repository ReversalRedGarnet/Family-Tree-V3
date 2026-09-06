import { wouldCreateCycle, parentsOf, activePartnersOf } from './generations';
import { getPersonDateWarnings, getParentChildAgeWarnings } from './dates';

const unordered = (rel, x, y) =>
  (rel.a === x && rel.b === y) || (rel.a === y && rel.b === x);

const displayName = (people, id) => {
  const p = people[id];
  return p ? `${p.firstName} ${p.lastName}`.trim() || 'Unnamed' : 'Someone';
};

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
    if (kind === 'parent') return rel.a === aId && rel.b === bId;
    if (kind === 'partner') {
      // A concluded partnership doesn't block a fresh one between the same
      // two people — that's a remarriage, a new chapter in their history,
      // not a duplicate of the old one. Only an unconcluded link (together
      // or separated — nothing has actually ended yet) counts as the
      // duplicate.
      return unordered(rel, aId, bId) && rel.status !== 'divorced' && rel.status !== 'widowed';
    }
    return unordered(rel, aId, bId);
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

    // Recorded siblings can't also become partners. This is the same
    // contradiction as the parent/child one above, just for a different
    // relationship — the two labels describe incompatible kinds of bond,
    // whichever direction it's approached from.
    const siblingLink = Object.values(relationships).find(
      (rel) => rel.kind === 'sibling' && unordered(rel, aId, bId)
    );
    if (siblingLink) {
      return { ok: false, error: 'These two are already recorded as siblings.' };
    }

    // A person already in an unconcluded partnership with someone ELSE
    // can't also become partners with a third person — marriage (or any
    // partner-kind link) is exclusive while it's still current. This is a
    // different check from the "already have that link" one above: that
    // one catches the SAME pair twice, this one catches a person already
    // spoken for by a DIFFERENT pair. Concluded partnerships (divorced,
    // widowed) don't count here either, for the same remarriage reason
    // they don't count as a duplicate above.
    const aTaken = activePartnersOf(aId, relationships).filter((id) => id !== bId);
    const bTaken = activePartnersOf(bId, relationships).filter((id) => id !== aId);
    if (aTaken.length) {
      return {
        ok: false,
        error: `${displayName(people, aId)} is already partnered with ${displayName(people, aTaken[0])} — that link needs to end first.`,
      };
    }
    if (bTaken.length) {
      return {
        ok: false,
        error: `${displayName(people, bId)} is already partnered with ${displayName(people, bTaken[0])} — that link needs to end first.`,
      };
    }
  }

  if (kind === 'sibling') {
    const parentLink = Object.values(relationships).find(
      (rel) => rel.kind === 'parent' && unordered(rel, aId, bId)
    );
    if (parentLink) {
      return { ok: false, error: 'These two are already parent and child.' };
    }

    // Symmetric with the partner check above: two people already recorded
    // as partners can't also become siblings.
    const partnerLink = Object.values(relationships).find(
      (rel) => rel.kind === 'partner' && unordered(rel, aId, bId)
    );
    if (partnerLink) {
      return { ok: false, error: 'These two are already recorded as partners.' };
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
