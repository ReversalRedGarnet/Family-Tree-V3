const TONE = {
  success: 'bg-cyan-deep text-white',
  error: 'bg-rose text-white',
  warning: 'bg-white text-ink border border-hairline',
  info: 'bg-white text-ink border border-hairline',
};

function Toast({ toast, onDismiss }) {
  return (
    <div
      className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lift ${
        TONE[toast.type] || TONE.info
      }`}
    >
      <span className="flex-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 rounded-lg border border-current px-2 py-0.5 text-xs font-medium"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 rounded px-1 text-lg leading-none opacity-60 transition-opacity hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

// Both live regions are always in the page, even with nothing to show.
// Screen readers only announce reliably when content is added to a region
// that already existed. Errors go in the assertive one, so they interrupt.
export default function ToastStack({ toasts, onDismiss }) {
  const urgent = toasts.filter((t) => t.type === 'error');
  const polite = toasts.filter((t) => t.type !== 'error');
  const region = 'flex w-full flex-col items-center gap-2 sm:items-end';

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end">
      <div role="alert" aria-live="assertive" aria-atomic="false" className={region}>
        {urgent.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" className={region}>
        {polite.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
