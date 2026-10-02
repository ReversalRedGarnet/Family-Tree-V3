import { useEffect, useId, useRef, useState } from 'react';
import Modal from './Modal';
import Tooltip from './Tooltip';
import {
  GENDERS,
  COLOR_THEMES,
  DEFAULT_GENDER,
  PARTNER_TYPES,
  PARENT_TYPES,
  SIBLING_TYPES,
} from '../utils/constants';
import { formatName } from '../utils/names';
import { FIELD, Label, YearInput } from './FormFields';

// This form's fields also tint their placeholder text.
const field = `${FIELD} placeholder:text-mist`;

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

// Long enough for any real name, short enough that a pasted paragraph
// doesn't become one. The card shows two lines and ends longer names with
// an ellipsis; the sidebar shows the full name on hover.
const NAME_MAX_LENGTH = 80;

const LIVING_OPTIONS = [
  { id: 'alive', label: 'Alive' },
  { id: 'deceased', label: 'Deceased' },
];

function labelFor(rel, otherName) {
  if (rel.kind === 'partner') {
    const type = PARTNER_TYPES.find((t) => t.id === rel.type)?.label || 'Partner';
    const status = rel.status && rel.status !== 'together' ? ` (${rel.status})` : '';
    const years = rel.startDate || rel.endDate ? ` ${rel.startDate || '?'}–${rel.endDate || ''}` : '';
    return `${type}${status}${years} · ${otherName}`;
  }
  if (rel.kind === 'parent') {
    return `${PARENT_TYPES.find((t) => t.id === rel.type)?.label || 'Parent'} · ${otherName}`;
  }
  if (rel.kind === 'sibling') {
    return `${SIBLING_TYPES.find((t) => t.id === rel.type)?.label || 'Sibling'} · ${otherName}`;
  }
  return `${rel.label || 'Other'} · ${otherName}`;
}

// Approximate dates are deliberately not supported; the hint below each
// year field says so, and where to put a "circa" instead.
const YEAR_HINT = 'Digits only, like 1953. Not sure? Give your best guess, or leave it blank and write "about 1890" in Notes.';

function formValues(person) {
  return {
    firstName: person?.firstName || '',
    lastName: person?.lastName || '',
    additionalNames: person?.additionalNames || '',
    gender: person?.gender || DEFAULT_GENDER,
    birthYear: person?.birthYear || '',
    deathYear: person?.deathYear || '',
    living: person?.living !== false,
    occupation: person?.occupation || '',
    notes: person?.notes || '',
    colorTheme: person?.colorTheme || COLOR_THEMES[0].id,
  };
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
  onEditRelationship,
  onDeleteRelationship,
}) {
  const [form, setForm] = useState({});
  const additionalNamesId = useId();
  const yearHintId = useId();
  // What the form was last filled from, to tell the person's own edits
  // apart from changes made to the record while the form is open.
  const filledFromRef = useRef(null);

  useEffect(() => {
    if (!open) {
      filledFromRef.current = null;
      return;
    }
    const next = { id: initialPerson?.id ?? null, values: formValues(initialPerson) };
    const previous = filledFromRef.current;
    filledFromRef.current = next;
    if (!previous || previous.id !== next.id) {
      setForm(next.values);
      return;
    }
    // Same person, changed underneath the open form (editing a link here to
    // "widowed" can mark them as no longer living). Take only the fields
    // that changed on the record; everything typed so far stays.
    setForm((f) => {
      const merged = { ...f };
      Object.keys(next.values).forEach((key) => {
        if (next.values[key] !== previous.values[key]) merged[key] = next.values[key];
      });
      return merged;
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
              maxLength={NAME_MAX_LENGTH}
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
              maxLength={NAME_MAX_LENGTH}
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
        <div>
          <Label
            htmlFor={additionalNamesId}
            hint="Middle names, a maiden name, a nickname — whatever helps tell them apart."
          >
            Additional names
          </Label>
          <input
            id={additionalNamesId}
            aria-describedby={`${additionalNamesId}-hint`}
            type="text"
            value={form.additionalNames || ''}
            placeholder="Ngozi (née Eze)"
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => set('additionalNames', e.target.value)}
            className={field}
          />
        </div>

        <label className="block">
          <Label>Year of birth</Label>
          <YearInput
            value={form.birthYear}
            onChange={(v) => set('birthYear', v)}
            placeholder="1953"
            describedBy={yearHintId}
            className={field}
          />
          <span id={yearHintId} className="mt-1 block text-xs leading-snug text-mist">
            {YEAR_HINT}
          </span>
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
              describedBy={`${yearHintId}-death`}
              className={field}
            />
            <span id={`${yearHintId}-death`} className="mt-1 block text-xs leading-snug text-mist">
              {YEAR_HINT}
            </span>
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
                const otherName = other ? formatName(other) : 'Someone';
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
                    {onEditRelationship && (
                      <button
                        type="button"
                        onClick={() => onEditRelationship(rel.id)}
                        aria-label={`Edit link: ${labelFor(rel, otherName)}`}
                        className="shrink-0 rounded-lg px-2 py-1 text-mist transition-colors hover:bg-cyan-wash hover:text-ink"
                      >
                        Edit
                      </button>
                    )}
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
          // The year of death is hidden while they're marked alive. Saving
          // drops it, rather than keeping a value nobody can see and then
          // warning about it.
          onClick={() => onSave(deceased ? form : { ...form, deathYear: '' })}
          className="flex-1 rounded-xl bg-cyan-deep px-4 py-2.5 font-medium text-white transition-colors hover:bg-ink"
        >
          {mode === 'edit' ? 'Save changes' : 'Add person'}
        </button>
      </div>
    </Modal>
  );
}
