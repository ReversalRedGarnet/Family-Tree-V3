// Generates a reasonably-unique id. Prefers the native crypto API but falls
// back to a manual generator for older browsers / non-secure (http) contexts
// where crypto.randomUUID is unavailable, so id generation never throws.
export function generateId(prefix = '') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return prefix ? `${prefix}_${crypto.randomUUID()}` : crypto.randomUUID();
    }
  } catch (err) {
    // fall through to manual fallback
  }
  const rand = () =>
    Math.random().toString(36).slice(2) + Date.now().toString(36).slice(-4);
  const raw = `${rand()}-${rand()}-${rand()}`;
  return prefix ? `${prefix}_${raw}` : raw;
}
