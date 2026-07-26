import { useEffect, useState } from 'react';
import Modal from './Modal';

function slugify(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleaned ? `${cleaned}-family-tree` : 'family-tree';
}

export default function ExportModal({ open, busy, onExportPng, onExportPdf, onCancel }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  if (!open) return null;

  const trimmed = name.trim();
  const memo = trimmed
    ? `Family tree of ${trimmed} — ${new Date().toLocaleDateString()}`
    : `Family tree — ${new Date().toLocaleDateString()}`;
  const payload = { name: trimmed, memo, fileName: slugify(trimmed) };

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
