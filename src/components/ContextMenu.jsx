import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Clamped to the viewport so it never opens half off-screen on a phone.
export default function ContextMenu({ open, x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const width = el?.offsetWidth || 220;
    const height = el?.offsetHeight || 240;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('touchstart', dismiss);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('touchstart', dismiss);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[13rem] max-w-[16rem] overflow-hidden rounded-xl border border-hairline bg-white py-1 shadow-lift"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={`d-${idx}`} className="my-1 border-t border-hairline" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className={`block w-full px-3.5 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
              item.danger
                ? 'text-rose hover:bg-rose/10'
                : 'text-ink hover:bg-cyan-wash'
            }`}
          >
            {item.label}
            {item.hint && <span className="mt-0.5 block text-xs text-mist">{item.hint}</span>}
          </button>
        )
      )}
    </div>
  );
}
