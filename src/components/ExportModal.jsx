import { useEffect, useState } from 'react';
import Modal from './Modal';
import { EXPORT_THEMES } from '../utils/constants';

function slugify(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleaned ? `${cleaned}-family-tree` : 'family-tree';
}

export default function ExportModal({ open, busy, onExportPng, onExportPdf, onCancel }) {
  const [name, setName] = useState('');
  const [themeId, setThemeId] = useState(EXPORT_THEMES[0].id);

  useEffect(() => {
    if (open) {
      setName('');
      setThemeId(EXPORT_THEMES[0].id);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = name.trim();
  const memo = trimmed
    ? `Family tree of ${trimmed} — ${new Date().toLocaleDateString()}`
    : `Family tree — ${new Date().toLocaleDateString()}`;
  const payload = { name: trimmed, memo, fileName: slugify(trimmed), themeId };

  return (
    <Modal
      open={open}
      title="Whose tree is this?"
      subtitle="The name gets stamped along the bottom of the picture."
      onClose={busy ? undefined : onCancel}
      size="sm"
    >
      <input
        type="text"
        autoFocus
        value={name}
        disabled={busy}
        placeholder="the Okafor family"
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-mist/60 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30 disabled:opacity-50"
      />

      <p className="mt-2.5 rounded-lg bg-paper px-3 py-2 tnum text-[11px] leading-relaxed text-mist">
        {memo}
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-mist">Look</p>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => setThemeId(t.id)}
              className={`rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                themeId === t.id
                  ? 'border-cyan bg-cyan-wash'
                  : 'border-hairline bg-white hover:border-cyan-soft'
              }`}
            >
              <span
                className="mb-1.5 block h-6 w-full rounded-md border border-hairline/60"
                style={{ background: t.background }}
                aria-hidden="true"
              />
              <span className="block text-xs font-medium text-ink">{t.label}</span>
              <span className="block text-[11px] leading-snug text-mist">{t.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mist">
          Only changes the exported picture — the board itself always stays as you see it.
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => onExportPng(payload)}
          disabled={busy}
          className="flex-1 rounded-xl bg-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-cyan-deep disabled:opacity-50"
        >
          {busy ? 'Exporting…' : 'Save PNG'}
        </button>
        <button
          onClick={() => onExportPdf(payload)}
          disabled={busy}
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-2.5 font-medium text-ink transition-colors hover:bg-cyan-wash disabled:opacity-50"
        >
          {busy ? 'Exporting…' : 'Save PDF'}
        </button>
      </div>
    </Modal>
  );
}
