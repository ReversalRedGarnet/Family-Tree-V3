import { wouldCreateCycle, generationOffset, isBirthLink } from './generations';
import { getPersonDateWarnings, getParentChildAgeWarnings, parseYear } from './dates';
import { formatName, nameById } from './names';

const unordered = (rel, x, y) =>
  (rel.a === x && rel.b === y) || (rel.a === y && rel.b === x);


// A partnership that has ended. Together, separated and no status at all are
// all still current.
export const isEndedPartnership = (status) => status === 'divorced' || status === 'widowed';

// Everyone this person is in a partnership with that hasn't ended. Unlike
// activePartnersOf (generations.js), this counts separated: a separation
// isn't a divorce, so it still blocks a new current partnership.
// activePartnersOf leaves separated out on purpose, for a different
// question (who to auto-link as a new child's other parent).
function unconcludedPartnersOf(personId, relationships) {
  return Object.values(relationships)
    .filter(
      (rel) =>
        rel.kind === 'partner' &&
        (rel.a === personId || rel.b === personId) &&
        !isEndedPartnership(rel.status)
    )
    .map((rel) => (rel.a === personId ? rel.b : rel.a));
}

// The only blocking rules left are the ones that would make the tree
// self-contradictory. Everything else — no parents yet, no partner, a child
// with a single parent — is allowed, because none of that is an error.
//
// `details` is the new link's own fields; for a partner link its `status`
// decides whether the exclusivity rules below apply at all.
export function validateRelationship(kind, aId, bId, people, relationships, details = {}) {
  if (!aId || !bId) return { ok: false, error: 'Pick two people first.' };
  if (aId === bId) return { ok: false, error: "You can't link someone to themselves." };
  if (!people[aId] || !people[bId]) {
    return { ok: false, error: 'One of those people is no longer on the board.' };
  }

  // An ended partnership is history, not a current claim on anyone: it can
  // be recorded alongside a current one, with someone else or with the same
  // person (married, divorced, remarried).
  const newPartnershipIsCurrent = kind === 'partner' && !isEndedPartnership(details.status);

  const existing = Object.values(relationships).find((rel) => {
    if (rel.kind !== kind) return false;
    if (kind === 'parent') return rel.a === aId && rel.b === bId;
    if (kind === 'partner') {
      // Only two CURRENT partnerships between the same pair are duplicates.
      return newPartnershipIsCurrent && unordered(rel, aId, bId) && !isEndedPartnership(rel.status);
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
    // they don't count as a duplicate above. Only a CURRENT new partnership
    // is held to this; recording an ended one never is.
    const aTaken = newPartnershipIsCurrent ? unconcludedPartnersOf(aId, relationships).filter((id) => id !== bId) : [];
    const bTaken = newPartnershipIsCurrent ? unconcludedPartnersOf(bId, relationships).filter((id) => id !== aId) : [];
    const taken = (id, otherId) => ({
      ok: false,
      error: `${nameById(people, id)} is already partnered with ${nameById(people, otherId)}. Mark that link as divorced or widowed first (click it, then Edit link…).`,
    });
    if (aTaken.length) return taken(aId, aTaken[0]);
    if (bTaken.length) return taken(bId, bTaken[0]);
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

  // The general rule behind every check above: a link must agree with the
  // generations the existing links already give these two people. A parent
  // sits exactly one row above their child; partners and siblings share a
  // row. Anything else would put someone in two generations at once.
  const required = kind === 'parent' ? 1 : kind === 'partner' || kind === 'sibling' ? 0 : null;
  if (required !== null) {
    const offset = generationOffset(aId, bId, people, relationships);
    if (offset !== null && offset !== required) {
      return { ok: false, error: generationConflictMessage(kind, offset, nameById(people, aId), nameById(people, bId)) };
    }
  }

  return { ok: true };
}

// `offset` is how many generations below A the existing links put B.
function generationConflictMessage(kind, offset, aName, bName) {
  const gens = (n) => `${n} generation${n === 1 ? '' : 's'}`;
  const where =
    offset === 0
      ? `${aName} and ${bName} are already in the same generation`
      : offset > 0
        ? `${bName} is already ${gens(offset)} below ${aName}`
        : `${bName} is already ${gens(-offset)} above ${aName}`;
  if (kind === 'parent') return `${where}, so ${aName} can't be ${bName}'s parent.`;
  return `${where}, so they can't be ${kind === 'partner' ? 'partners' : 'siblings'}.`;
}

// What deleting one person, or several at once, takes with it: every link
// touching any of them, and the children who stay behind (a child who is
// also being deleted isn't "staying on the board").
export function describeDeleteImpact(personIdOrIds, people, relationships) {
  const ids = new Set([personIdOrIds].flat());
  const links = Object.values(relationships).filter((rel) => ids.has(rel.a) || ids.has(rel.b));
  const children = new Set(
    links.filter((rel) => rel.kind === 'parent' && ids.has(rel.a) && !ids.has(rel.b)).map((rel) => rel.b)
  );
  return { linkCount: links.length, childCount: children.size };
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
      name: formatName(person),
      message,
    });

  Object.values(people).forEach((person) => {
    getPersonDateWarnings(person).forEach((message) => note(person, message));

    // Age gaps only say something about birth parents: a step-parent five
    // years older than their stepchild is entirely ordinary.
    const birthParents = Object.values(relationships)
      .filter((rel) => rel.kind === 'parent' && rel.b === person.id && isBirthLink(rel))
      .map((rel) => people[rel.a])
      .filter(Boolean);
    getParentChildAgeWarnings(person, ...birthParents).forEach((message) => note(person, message));
  });

  Object.values(relationships).forEach((rel) => {
    if (rel.kind !== 'partner' || !people[rel.a] || !people[rel.b]) return;
    const start = parseYear(rel.startDate);
    const end = parseYear(rel.endDate);
    if (start && end && end < start) {
      note(people[rel.a], `Their partnership with ${formatName(people[rel.b])} ends (${end}) before it starts (${start}).`);
    }
  });

  return warnings;
}
