import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Tooltip, { InfoDot } from './Tooltip';
import {
  GENDERS,
  SHAPES,
  COLOR_THEMES,
  MAX_PHOTO_BYTES,
  PARTNER_TYPES,
  PARENT_TYPES,
  SIBLING_TYPES,
} from '../utils/constants';

const field =
  'w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-mist/60 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30';

function Label({ children, hint }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-mist">
      {children}
      {hint && <InfoDot label={hint} />}
    </span>
  );
}

const SHAPE_GLYPH = {
  rounded: '▢',
  square: '◻',
  circle: '◯',
  diamond: '◇',
  hexagon: '⬡',
};

function labelFor(rel, otherName) {
  if (rel.kind === 'partner') {
    const type = PARTNER_TYPES.find((t) => t.id === rel.type)?.label || 'Partner';
    return rel.status && rel.status !== 'together'
      ? `${type} (${rel.status}) · ${otherName}`
      : `${type} · ${otherName}`;
  }
  if (rel.kind === 'parent') {
    const type = PARENT_TYPES.find((t) => t.id === rel.type)?.label || 'Parent';
    return `${type} · ${otherName}`;
  }
  if (rel.kind === 'sibling') {
    const type = SIBLING_TYPES.find((t) => t.id === rel.type)?.label || 'Sibling';
    return `${type} · ${otherName}`;
  }
  return `${rel.label || 'Other'} · ${otherName}`;
}

export default function PersonModal({
  open,
  mode,
  initialPerson,
  people,
  relationships = {},
  onSave,
  onCancel,
  onRequestDelete,
  onDeleteRelationship,
  onPhotoError,
}) {
  const [form, setForm] = useState({});
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: initialPerson?.firstName || '',
      lastName: initialPerson?.lastName || '',
      gender: initialPerson?.gender || 'unspecified',
      birthDate: initialPerson?.birthDate || '',
      deathDate: initialPerson?.deathDate || '',
      living: initialPerson?.living !== false,
      occupation: initialPerson?.occupation || '',
      notes: initialPerson?.notes || '',
      photo: initialPerson?.photo || null,
      shape: initialPerson?.shape || SHAPES[0],
      colorTheme: initialPerson?.colorTheme || COLOR_THEMES[0].id,
    });
  }, [open, initialPerson]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      onPhotoError('That photo is over 2 MB. Pick a smaller one.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => set('photo', event.target?.result);
    reader.onerror = () => onPhotoError("That file couldn't be read. Try another image.");
    reader.readAsDataURL(file);
  };

  const links =
    mode === 'edit' && initialPerson
      ? Object.values(relationships).filter(
          (rel) => rel.a === initialPerson.id || rel.b === initialPerson.id
        )
      : [];

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? 'Edit person' : 'Add a person'}
      subtitle={mode === 'edit' ? undefined : 'Only a name is needed — everything else is optional.'}
      onClose={onCancel}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>First name</Label>
            <input
              autoFocus
              type="text"
              value={form.firstName || ''}
              onChange={(e) => set('firstName', e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <Label>Last name</Label>
            <input
              type="text"
              value={form.lastName || ''}
              onChange={(e) => set('lastName', e.target.value)}
              className={field}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Gender</Label>
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={field}>
              {GENDERS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>Born</Label>
            <input
              type="date"
              value={form.birthDate || ''}
              onChange={(e) => set('birthDate', e.target.value)}
              className={field}
            />
          </label>
        </div>

        <div className="rounded-xl border border-hairline p-3">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.living !== false}
              onChange={(e) => set('living', e.target.checked)}
              className="h-4 w-4 accent-[#0EA5B7]"
            />
            <span className="text-sm text-ink">Still living</span>
          </label>

          {form.living === false && (
            <label className="mt-3 block">
              <Label hint="Deceased cards get a grey band along the bottom so they stand out on the board.">
                Died
              </Label>
              <input
                type="date"
                value={form.deathDate || ''}
                onChange={(e) => set('deathDate', e.target.value)}
                className={field}
              />
            </label>
          )}
        </div>

        <label className="block">
          <Label>Occupation</Label>
          <input
            type="text"
            value={form.occupation || ''}
            onChange={(e) => set('occupation', e.target.value)}
            placeholder="Baker, teacher, ship's engineer…"
            className={field}
          />
        </label>

        <div>
          <Label>Card colour</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_THEMES.map((c) => (
              <Tooltip key={c.id} label={c.label}>
                <button
                  type="button"
                  onClick={() => set('colorTheme', c.id)}
                  aria-label={c.label}
                  aria-pressed={form.colorTheme === c.id}
                  style={{ backgroundColor: c.hex }}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    form.colorTheme === c.id
                      ? 'ring-2 ring-ink ring-offset-2 ring-offset-white'
                      : 'hover:scale-110'
                  }`}
                />
              </Tooltip>
            ))}
          </div>
        </div>

        <div>
          <Label>Card shape</Label>
          <div className="flex flex-wrap gap-2">
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set('shape', s)}
                aria-pressed={form.shape === s}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs capitalize transition-colors ${
                  form.shape === s
                    ? 'border-cyan bg-cyan-wash text-cyan-deep'
                    : 'border-hairline text-mist hover:border-cyan-soft'
                }`}
              >
                <span aria-hidden="true">{SHAPE_GLYPH[s]}</span>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Photo</Label>
          <div className="flex items-center gap-3">
            {form.photo && (
              <img src={form.photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhoto}
              className="min-w-0 flex-1 text-xs text-mist file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-wash file:px-3 file:py-2 file:text-xs file:font-medium file:text-cyan-deep"
            />
            {form.photo && (
              <button
                type="button"
                onClick={() => {
                  set('photo', null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="shrink-0 rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-mist transition-colors hover:text-rose"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-mist/80">Up to 2 MB. Never uploaded anywhere.</p>
        </div>

        <label className="block">
          <Label>Notes</Label>
          <textarea
            rows={3}
            value={form.notes || ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything worth remembering."
            className={`${field} resize-y`}
          />
        </label>

        {mode === 'edit' && (
          <div>
            <Label hint="Unlinking only removes the connection — both people stay on the board.">
              Links ({links.length})
            </Label>
            {links.length === 0 ? (
              <p className="text-xs text-mist">
                Not linked to anyone yet. Drag their card onto someone else's to connect them.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {links.map((rel) => {
                  const otherId = rel.a === initialPerson.id ? rel.b : rel.a;
                  const other = people[otherId];
                  const otherName = other
                    ? `${other.firstName} ${other.lastName}`.trim() || 'Unnamed'
                    : 'Someone';
                  const isParentOf = rel.kind === 'parent' && rel.a === initialPerson.id;
                  return (
                    <li
                      key={rel.id}
                      className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-xs text-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {rel.kind === 'parent' && (
                          <span className="text-mist">{isParentOf ? 'Parent of ' : 'Child of '}</span>
                        )}
                        {labelFor(rel, otherName)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteRelationship(rel.id)}
                        className="shrink-0 rounded-lg px-2 py-1 text-mist transition-colors hover:bg-rose/10 hover:text-rose"
                      >
                        Unlink
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        {mode === 'edit' && onRequestDelete && (
          <button
            onClick={onRequestDelete}
            className="rounded-xl border border-hairline px-4 py-2.5 font-medium text-rose transition-colors hover:bg-rose/10"
          >
            Delete
          </button>
        )}
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-2.5 font-medium text-ink transition-colors hover:bg-cyan-wash"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          className="flex-1 rounded-xl bg-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-cyan-deep"
        >
          {mode === 'edit' ? 'Save changes' : 'Add person'}
        </button>
      </div>
    </Modal>
  );
}
