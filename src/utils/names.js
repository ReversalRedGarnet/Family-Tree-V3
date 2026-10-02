// A person's display name. Null-safe on purpose: a record from an older save
// or from Drive may be missing either name, and interpolating it directly
// used to print "Ann undefined".
export function formatName(person, fallback = 'Unnamed') {
  if (!person) return fallback;
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || fallback;
}
