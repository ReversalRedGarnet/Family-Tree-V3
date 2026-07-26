// Years only — no months, no days. People remember "around 1953" far more
// reliably than an exact date, and a year is all the tree ever displays.
//
// Everything here is deliberately forgiving: these functions only ever
// produce non-blocking warning strings. They never throw and never block a
// save.

const MIN_YEAR = 1;
const MAX_YEAR = 2999;

export function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).trim().match(/^(\d{1,4})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

export function isPlausibleYear(value) {
  if (!value) return true; // empty is fine, the field is optional
  return parseYear(value) !== null;
}

// Formats the years shown on a card.
export function formatLifespan(person) {
  const birth = parseYear(person?.birthYear);
  const death = parseYear(person?.deathYear);
  if (person?.living === false) {
    if (!birth && !death) return '';
    return `${birth ?? '?'} – ${death ?? '?'}`;
  }
  return birth ? `b. ${birth}` : '';
}

export function getPersonDateWarnings(person) {
  const warnings = [];
  if (!person) return warnings;

  if (person.birthYear && !isPlausibleYear(person.birthYear)) {
    warnings.push(`"${person.birthYear}" isn't a year we can read.`);
  }
  if (person.deathYear && !isPlausibleYear(person.deathYear)) {
    warnings.push(`"${person.deathYear}" isn't a year we can read.`);
  }

  const birth = parseYear(person.birthYear);
  const death = parseYear(person.deathYear);

  if (birth && death && death < birth) {
    warnings.push('The year of death comes before the year of birth.');
  }
  if (person.living !== false && death) {
    warnings.push('Marked as living, but a year of death is filled in.');
  }
  if (birth && death && death - birth > 120) {
    warnings.push(`That works out to ${death - birth} years old — worth a check.`);
  }

  return warnings;
}

// Sense-checks a child's birth year against their parents'.
export function getParentChildAgeWarnings(child, ...parents) {
  const warnings = [];
  const childYear = parseYear(child?.birthYear);
  if (!childYear) return warnings;

  parents.filter(Boolean).forEach((parent) => {
    const parentYear = parseYear(parent.birthYear);
    if (!parentYear) return;
    const gap = childYear - parentYear;
    const who = parent.firstName || 'A parent';
    if (gap < 0) {
      warnings.push(`${who} is listed as born after them.`);
    } else if (gap < 12) {
      warnings.push(`${who} would only have been ${gap} — worth a check.`);
    } else if (gap > 75) {
      warnings.push(`${who} would have been ${gap} years older — worth a check.`);
    }
  });

  return warnings;
}
