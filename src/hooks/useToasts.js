import { useState, useCallback, useEffect, useRef } from 'react';

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const timeoutsRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
  }, []);

  // `action` is an optional { label, onClick } shown as a button on the
  // toast; clicking it also dismisses the toast.
  const push = useCallback(
    (message, type = 'info', duration = 5000, action = null) => {
      const id = `toast_${toastIdRef.current++}`;
      setToasts((prev) => [...prev, { id, message, type, action }]);

      if (duration > 0) {
        timeoutsRef.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  // Don't leave timers running against an unmounted component.
  useEffect(() => {
    const timeouts = timeoutsRef;
    return () => {
      Object.values(timeouts.current).forEach(clearTimeout);
      timeouts.current = {};
    };
  }, []);

  return { toasts, push, dismiss };
}
