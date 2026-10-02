import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const itemButtons = (menu) =>
  Array.from(menu?.querySelectorAll('[role="menuitem"]:not([disabled])') || []);

// Whether the last thing the person did was a key press or a pointer
// (mouse, pen, finger). A menu opened from the keyboard starts on its first
// item; one opened by right-click or long-press takes focus itself, so no
// item lights up under the pointer, and the arrow keys still work from it.
let lastInput = 'pointer';
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastInput = 'keyboard'), true);
  window.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
}

// Clamped to the viewport so it never opens half off-screen on a phone.
//
// Keyboard: focus moves into the menu on open; Up/Down (wrapping) and
// Home/End move between items; Enter or Space picks one (they're buttons);
// Escape or Tab closes. Closing from the keyboard, or picking an item,
// hands focus back to whatever had it when the menu opened -- before the
// item runs, so a dialog it opens returns focus there too when it closes.
export default function ContextMenu({ open, x, y, items, onClose }) {
  const menuRef = useRef(null);
  const openerRef = useRef(null);
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

  // Once per opening, not per item change: the opener is whatever had focus
  // before the menu took it.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = menuRef.current?.contains(active) ? openerRef.current : active;
    const first = lastInput === 'keyboard' ? itemButtons(menuRef.current)[0] : null;
    (first || menuRef.current)?.focus();
  }, [open, x, y]);

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

  const returnFocus = () => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }
  };

  const onKeyDown = (e) => {
    const buttons = itemButtons(menuRef.current);
    const i = buttons.indexOf(document.activeElement);
    let next;
    if (e.key === 'ArrowDown') next = buttons[(i + 1) % buttons.length];
    else if (e.key === 'ArrowUp') next = buttons[i === -1 ? buttons.length - 1 : (i - 1 + buttons.length) % buttons.length];
    else if (e.key === 'Home') next = buttons[0];
    else if (e.key === 'End') next = buttons[buttons.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      // Picked here rather than left to the button: the board's hold-Space-
      // to-pan listener sits on window and would otherwise swallow Space.
      e.preventDefault();
      e.stopPropagation();
      buttons[i]?.click();
      return;
    }
    else if (e.key === 'Escape' || e.key === 'Tab') {
      // The menu is on top, so the key is the menu's alone: it doesn't also
      // reach the app's own Escape (which clears the selection).
      e.preventDefault();
      e.stopPropagation();
      returnFocus();
      onClose();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    next?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed z-50 focus-visible:outline-none min-w-[13rem] max-w-[16rem] overflow-hidden rounded-xl border border-hairline bg-white py-1 shadow-lift"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={`d-${idx}`} role="separator" className="my-1 border-t border-hairline" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              returnFocus();
              item.onSelect();
              onClose();
            }}
            className={`block w-full px-3.5 py-2 text-left text-sm transition-colors focus-visible:outline-offset-[-2px] disabled:opacity-40 ${
              item.danger
                ? 'text-rose hover:bg-rose/10 focus-visible:bg-rose/10'
                : 'text-ink hover:bg-cyan-wash focus-visible:bg-cyan-wash'
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
