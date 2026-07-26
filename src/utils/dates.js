// All date helpers are deliberately forgiving: a person can be entered with
// partial/missing/malformed dates (this is a fun weekend tool, not a legal
// registry) so these functions only ever produce non-blocking warning
// strings, never throw and never block a save.

export function parseYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  // Accept full dates (YYYY-MM-DD), or a bare year like "1950"
  const yearMatch = trimmed.match(/^(\d{3,4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (!Number.isNaN(year) && year > 0 && year < 3000) return year;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  return null;
}

export function isPlausibleDateString(dateStr) {
  if (!dateStr) return true; // empty is allowed, just optional
  return parseYear(dateStr) !== null;
}

// Returns a list of human-readable warning strings (empty array = no issues).
export function getPersonDateWarnings(person) {
  const warnings = [];
  if (!person) return warnings;

  if (person.birthDate && !isPlausibleDateString(person.birthDate)) {
    warnings.push(`Birth date "${person.birthDate}" doesn't look like a valid date.`);
  }
  if (person.deathDate && !isPlausibleDateString(person.deathDate)) {
    warnings.push(`Death date "${person.deathDate}" doesn't look like a valid date.`);
  }

  const birthYear = parseYear(person.birthDate);
  const deathYear = parseYear(person.deathDate);

  if (birthYear && deathYear && deathYear < birthYear) {
    warnings.push('Death date is before birth date.');
  }
  if (person.living && deathYear) {
    warnings.push('Marked as living, but a death date is set.');
  }
  if (birthYear && deathYear && deathYear - birthYear > 130) {
    warnings.push('That would make them over 130 years old — double-check the dates.');
  }

  return warnings;
}

// Checks a child's birth year against their parents' birth years, given the
// two parent Person objects (either may be undefined/null).
export function getParentChildAgeWarnings(child, parentA, parentB) {
  const warnings = [];
  const childYear = parseYear(child?.birthDate);
  if (!childYear) return warnings;

  [parentA, parentB].filter(Boolean).forEach((parent) => {
    const parentYear = parseYear(parent.birthDate);
    if (!parentYear) return;
    const gap = childYear - parentYear;
    if (gap < 0) {
      warnings.push(`${parent.firstName || 'A parent'} appears to be born after ${child.firstName || 'this person'}.`);
    } else if (gap < 12) {
      warnings.push(`${parent.firstName || 'A parent'} would only be ${gap} years old — double-check the dates.`);
    } else if (gap > 75) {
      warnings.push(`${parent.firstName || 'A parent'} would be ${gap} years older — double-check the dates.`);
    }
  });

  return warnings;
}
