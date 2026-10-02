import { InfoDot } from './Tooltip';

// The pieces both dialogs (PersonModal, RelationshipModal) build their
// forms from.

export const FIELD =
  'w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink transition-colors focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30';

// Inside a wrapping <label>, pass no htmlFor. A field with a hint must
// instead pass its input's id as htmlFor: the (i) button then sits beside
// a real <label>, not inside one, where it would take the field's name.
export function Label({ children, hint, htmlFor }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-mist">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : children}
      {hint && <InfoDot label={hint} />}
      {hint && htmlFor && (
        <span id={`${htmlFor}-hint`} className="sr-only">
          {hint}
        </span>
      )}
    </span>
  );
}

// Years only. Strips anything that isn't a digit so the field can't hold
// something the tree won't be able to read back. Approximate dates are
// deliberately not supported (see YEAR_HINT in PersonModal).
export function YearInput({ value, onChange, placeholder, disabled, describedBy, className = FIELD }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={4}
      value={value || ''}
      placeholder={placeholder}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      className={className}
    />
  );
}
