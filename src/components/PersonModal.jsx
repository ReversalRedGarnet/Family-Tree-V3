import { useEffect, useState } from 'react';
import Modal from './Modal';
import Tooltip, { InfoDot } from './Tooltip';
import {
  GENDERS,
  COLOR_THEMES,
  DEFAULT_GENDER,
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

// The three zones from the design, each introduced by an eyebrow and split
// by a dotted rule.
function Zone({ eyebrow, first, children }) {
  return (
    <section className={first ? '' : 'mt-5'}>
      {!first && <hr className="zone-rule mb-4" />}
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-deep">
        {eyebrow}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// A pair of choices with "or" between them, as drawn in the design. The
// whole option is the control — no separate radio circle to render or to
// get squeezed by flexbox.
function ChoicePair({ options, value, onChange, name }) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={name}>
      {options.map((option, i) => (
        <div key={option.id} className="contents">
          {i > 0 && <span className="shrink-0 text-xs text-mist">or</span>}
          <button
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              value === option.id
                ? 'border-cyan bg-cyan-wash font-medium text-cyan-deep'
                : 'border-hairline text-ink hover:border-cyan-soft'
            }`}
          >
            {option.label}
          </button>
        </div>
      ))}
    </div>
  );
}

const LIVING_OPTIONS = [
  { id: 'alive', label: 'Alive' },
  { id: 'deceased', label: 'Deceased' },
];

function labelFor(rel, otherName) {
  if (rel.kind === 'partner') {
    const type = PARTNER_TYPES.find((t) => t.id === rel.type)?.label || 'Partner';
    return rel.status && rel.status !== 'together'
      ? `${type} (${rel.status}) · ${otherName}`
      : `${type} · ${otherName}`;
  }
  if (rel.kind === 'parent') {
    return `${PARENT_TYPES.find((t) => t.id === rel.type)?.label || 'Parent'} · ${otherName}`;
  }
  if (rel.kind === 'sibling') {
    return `${SIBLING_TYPES.find((t) => t.id === rel.type)?.label || 'Sibling'} · ${otherName}`;
  }
  return `${rel.label || 'Other'} · ${otherName}`;
}

// Years only. Strips anything that isn't a digit so the field can't hold
// something the tree won't be able to read back.
function YearInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={4}
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      className={field}
    />
  );
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
}) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: initialPerson?.firstName || '',
      lastName: initialPerson?.lastName || '',
      additionalNames: initialPerson?.additionalNames || '',
      gender: initialPerson?.gender || DEFAULT_GENDER,
      birthYear: initialPerson?.birthYear || '',
      deathYear: initialPerson?.deathYear || '',
      living: initialPerson?.living !== false,
      occupation: initialPerson?.occupation || '',
      notes: initialPerson?.notes || '',
      colorTheme: initialPerson?.colorTheme || COLOR_THEMES[0].id,
    });
  }, [open, initialPerson]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const links =
    mode === 'edit' && initialPerson
      ? Object.values(relationships).filter(
          (rel) => rel.a === initialPerson.id || rel.b === initialPerson.id
        )
      : [];

  const deceased = form.living === false;

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? 'Edit person' : 'Add a person'}
      subtitle="Only name, gender and living status are needed — everything else is optional."
      onClose={onCancel}
      size="md"
    >
      <Zone eyebrow="Mandatory" first>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>First name</Label>
            <input
              autoFocus
              type="text"
              value={form.firstName || ''}
              placeholder="Amara"
              onChange={(e) => set('firstName', e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <Label>Last name</Label>
            <input
              type="text"
              value={form.lastName || ''}
              placeholder="Okafor"
              onChange={(e) => set('lastName', e.target.value)}
              className={field}
            />
          </label>
        </div>

        <div>
          <Label hint="Sets the card shape: a rectangle for male, a circle for female.">
            Gender
          </Label>
          <ChoicePair
            name="gender"
            options={GENDERS}
            value={form.gender}
            onChange={(id) => set('gender', id)}
          />
        </div>

        <div>
          <Label>Living status</Label>
          <ChoicePair
            name="living"
            options={LIVING_OPTIONS}
            value={deceased ? 'deceased' : 'alive'}
            onChange={(id) => set('living', id === 'alive')}
          />
        </div>
      </Zone>

      <Zone eyebrow="Additional details">
        <label className="block">
          <Label hint="Middle names, a maiden name, a nickname — whatever helps tell them apart.">
            Additional names
          </Label>
          <input
            type="text"
            value={form.additionalNames || ''}
            placeholder="Ngozi (née Eze)"
            onChange={(e) => set('additionalNames', e.target.value)}
            className={field}
          />
        </label>

        <label className="block">
          <Label>Year of birth</Label>
          <YearInput value={form.birthYear} onChange={(v) => set('birthYear', v)} placeholder="1953" />
        </label>

        <label className="block">
          <Label>Occupation</Label>
          <input
            type="text"
            value={form.occupation || ''}
            placeholder="Baker, teacher, ship's engineer…"
            onChange={(e) => set('occupation', e.target.value)}
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

        <label className="block">
          <Label>Notes</Label>
          <textarea
            rows={3}
            value={form.notes || ''}
            placeholder="Anything worth remembering about them."
            onChange={(e) => set('notes', e.target.value)}
            className={`${field} resize-y`}
          />
        </label>
      </Zone>

      {deceased && (
        <Zone eyebrow="If applicable">
          <label className="block">
            <Label>Year of death</Label>
            <YearInput
              value={form.deathYear}
              onChange={(v) => set('deathYear', v)}
              placeholder="2011"
            />
          </label>
        </Zone>
      )}

      {mode === 'edit' && (
        <Zone eyebrow={`Links (${links.length})`}>
          {links.length === 0 ? (
            <p className="text-xs leading-relaxed text-mist">
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
        </Zone>
      )}

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
