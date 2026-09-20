import { useEffect, useRef } from 'react';

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// One shell for every dialog. On phones it's a bottom sheet that can't get
// taller than the screen; on wider screens it's a centred card. Either way
// the body scrolls, not the page, so nothing ends up unreachable.
export default function Modal({ open, title, subtitle, onClose, size = 'md', children }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Remember whatever had focus so it can get it back on close, rather
    // than leaving focus stuck on a button that's now behind the backdrop.
    previousFocusRef.current = document.activeElement;

    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(dialog?.querySelectorAll(FOCUSABLE_SELECTOR) || []).filter((el) => el.offsetParent !== null);
    // A field inside the dialog may already have claimed focus via its own
    // autoFocus (PersonModal's first-name input, for instance) — that native
    // browser behaviour runs before this effect does, so it must be checked
    // for and left alone rather than overridden with the first focusable
    // element by default (which would usually just be the × close button).
    if (!dialog?.contains(document.activeElement)) {
      (focusable()[0] || dialog)?.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        // Focus escaped the dialog some other way (e.g. programmatic blur) —
        // pull it back in rather than letting Tab continue into the page.
        e.preventDefault();
        first.focus();
      }
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      const toRestore = previousFocusRef.current;
      if (toRestore && typeof toRestore.focus === 'function') toRestore.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl ${SIZES[size]}`}
      >
        {/* Grab handle, phone only — signals the sheet is dismissible. */}
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-hairline sm:hidden" />

        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-mist">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-mist transition-colors hover:bg-cyan-wash hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="thin-scroll flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
