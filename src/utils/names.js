// A person's display name. Null-safe on purpose: a record from an older save
// or from Drive may be missing either name, and interpolating it directly
// used to print "Ann undefined".
export function formatName(person, fallback = 'Unnamed') {
  if (!person) return fallback;
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || fallback;
}

// A person looked up by id, for messages: "Someone" when they're no longer
// on the board.
export function nameById(people, id) {
  const person = people?.[id];
  return person ? formatName(person) : 'Someone';
}

// The name on a card and in the people list. Unlike formatName, a missing
// first name shows as "Unnamed" even when there's a last name ("Unnamed
// Lee"); see AUDIT F13.
export function cardName(person) {
  return `${person.firstName || 'Unnamed'} ${person.lastName || ''}`.trim();
}
