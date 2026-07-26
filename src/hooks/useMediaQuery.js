import { useEffect, useState } from 'react';

// Small wrapper around matchMedia so layout decisions that genuinely need
// JS (drawer vs rail) can react to viewport changes.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(list.matches);
    // addEventListener isn't available on MediaQueryList in older Safari.
    if (list.addEventListener) list.addEventListener('change', onChange);
    else list.addListener(onChange);
    return () => {
      if (list.removeEventListener) list.removeEventListener('change', onChange);
      else list.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
