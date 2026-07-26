import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Hover/focus tooltip that renders into a portal so it's never clipped by a
// scrolling panel. On touch devices there's no hover, so a tap opens it and
// it dismisses itself — see TouchHint below for the (i) affordance.
export default function Tooltip({
  label,
  detail,
  placement = 'top',
  disabled = false,
  children,
  className = '',
}) {
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const id = useId();

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setCoords(null);
  }, []);

  const show = useCallback(() => {
    const el = wrapRef.current;
    if (!el || disabled || !label) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: placement === 'bottom' ? rect.bottom + 8 : rect.top - 8,
      left: Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90),
      placement,
    });
  }, [disabled, label, placement]);

  // A tap shows it briefly, then it gets out of the way on its own.
  const showTemporarily = useCallback(() => {
    show();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(hide, 2600);
  }, [show, hide]);

  useEffect(() => {
    if (!coords) return undefined;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [coords, hide]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <span
      ref={wrapRef}
      className={`inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={showTemporarily}
      aria-describedby={coords ? id : undefined}
    >
      {children}
      {coords &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform:
                coords.placement === 'bottom' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              zIndex: 90,
            }}
            className="pointer-events-none max-w-[220px] rounded-lg bg-ink px-2.5 py-1.5 text-center text-xs leading-snug text-white shadow-lift"
          >
            <span className="font-medium">{label}</span>
            {detail && <span className="mt-0.5 block text-white/70">{detail}</span>}
          </span>,
          document.body
        )}
    </span>
  );
}

// The touch-friendly counterpart: a small (i) that carries the same copy.
export function InfoDot({ label, detail, className = '' }) {
  return (
    <Tooltip label={label} detail={detail} className={className}>
      <button
        type="button"
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-cyan/50 text-[10px] font-semibold leading-none text-cyan-deep transition-colors hover:bg-cyan hover:text-white"
      >
        i
      </button>
    </Tooltip>
  );
}
