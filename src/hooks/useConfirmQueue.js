import { useCallback, useRef, useState } from 'react';

let nextId = 1;

// Yes/no questions, shown one at a time. A question asked while another is
// on screen waits its turn instead of replacing it (a Drive conflict
// arriving mid-delete used to wipe the delete question away). A question
// asked from inside an answer (the next "Also their child?" in a chain)
// goes to the front, so a chain is never interrupted by an unrelated one.
//
// `resolve('onConfirm' | 'onCancel')` takes the current question off the
// queue first and then runs its handler, so handlers never need to close
// the dialog themselves. A question with no onCancel is simply dismissed.
export function useConfirmQueue() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const resolvingRef = useRef(false);
  const settledRef = useRef(new Set());

  const ask = useCallback((request) => {
    const entry = { ...request, id: nextId++ };
    const front = resolvingRef.current;
    setQueue((q) => (front ? [entry, ...q] : [...q, entry]));
    return entry.id;
  }, []);

  const resolve = useCallback((choice) => {
    const head = currentRef.current;
    // A double click lands twice before React re-renders; answer once.
    if (!head || settledRef.current.has(head.id)) return;
    settledRef.current.add(head.id);
    setQueue((q) => q.filter((entry) => entry.id !== head.id));
    resolvingRef.current = true;
    try {
      head[choice]?.();
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  return { current, pending: queue.length, ask, resolve };
}
