// The undo/redo stack transition, kept separate from React so it can be
// reasoned about (and tested) on its own.
//
// `history: false` bypasses the stack entirely for one commit: the new
// state becomes `present` without pushing the old one onto `past`, so a
// later undo reaches straight past this change to whatever came before it
// -- there was nothing the user did here to undo. `future` is still
// cleared, since it no longer follows from the new present. Used for a
// Drive sign-in's SILENT load (nothing on this device to lose, nothing the
// user chose, so nothing to undo) -- the explicit conflict-resolution path
// (the person picked "keep this device" or "use Drive's version") stays a
// normal, undoable commit, exactly as the README describes.
import { MAX_HISTORY } from './constants';

export function applyCommit(h, present, { history = true } = {}) {
  if (!history) return { past: h.past, present, future: [] };
  return {
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present,
    future: [],
  };
}
