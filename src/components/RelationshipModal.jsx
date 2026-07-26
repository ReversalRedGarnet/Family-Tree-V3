import { useEffect, useState } from 'react';
import Modal from './Modal';
import { InfoDot } from './Tooltip';
import {
  RELATIONSHIP_KINDS,
  PARTNER_TYPES,
  PARTNER_STATUS,
  SIBLING_TYPES,
  PARENT_TYPES,
} from '../utils/constants';

const field =
  'w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink transition-colors focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30';

function Label({ children, hint }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-mist">
      {children}
      {hint && <InfoDot label={hint} />}
    </span>
  );
}

// One dialog for every kind of link. Nothing here is a prerequisite for
// anything else — a sibling link doesn't need parents, a child doesn't need
// a couple.
export default function RelationshipModal({
  open,
  personA,
  personB,
  people,
  presetKind = 'partner',
  error,
  onConfirm,
  onCancel,
}) {
  const [kind, setKind] = useState(presetKind);
  const [swapped, setSwapped] = useState(false);
  const [partnerType, setPartnerType] = useState(PARTNER_TYPES[0].id);
  const [partnerStatus, setPartnerStatus] = useState(PARTNER_STATUS[0].id);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [siblingType, setSiblingType] = useState(SIBLING_TYPES[0].id);
  const [parentType, setParentType] = useState(PARENT_TYPES[0].id);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(presetKind);
    setSwapped(false);
    setPartnerType(PARTNER_TYPES[0].id);
    setPartnerStatus(PARTNER_STATUS[0].id);
    setStartDate('');
    setEndDate('');
    setSiblingType(SIBLING_TYPES[0].id);
    setParentType(PARENT_TYPES[0].id);
    setLabel('');
  }, [open, presetKind]);

  if (!open) return null;

  const nameOf = (id) => {
    const p = people[id];
    return p ? `${p.firstName} ${p.lastName}`.trim() || 'Unnamed' : 'Someone';
  };

  const a = swapped ? personB : personA;
  const b = swapped ? personA : personB;
  const together = partnerStatus === 'together';

  const submit = () => {
    if (kind === 'partner') {
      onConfirm('partner', a, b, {
        type: partnerType,
        status: partnerStatus,
        startDate,
        endDate: together ? '' : endDate,
      });
    } else if (kind === 'parent') {
      onConfirm('parent', a, b, { type: parentType });
    } else if (kind === 'sibling') {
      onConfirm('sibling', a, b, { type: siblingType });
    } else {
      onConfirm('other', a, b, { label: label.trim() });
    }
  };

  return (
    <Modal open={open} title="How are they related?" onClose={onCancel} size="md">
      <div className="mb-4 rounded-xl bg-cyan-wash px-3.5 py-3 text-sm text-ink">
        {kind === 'parent' ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{nameOf(a)}</span>
            <span className="text-mist">is the parent of</span>
            <span className="font-medium">{nameOf(b)}</span>
            <button
              onClick={() => setSwapped((v) => !v)}
              className="ml-auto rounded-lg border border-cyan/40 px-2 py-1 text-xs font-medium text-cyan-deep transition-colors hover:bg-white"
            >
              Swap
            </button>
          </div>
        ) : (
          <span>
            <span className="font-medium">{nameOf(a)}</span>
            <span className="text-mist"> and </span>
            <span className="font-medium">{nameOf(b)}</span>
          </span>
        )}
      </div>

      <div className="space-y-2">
        {RELATIONSHIP_KINDS.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              kind === option.id
                ? 'border-cyan bg-cyan-wash'
                : 'border-hairline bg-white hover:border-cyan-soft'
            }`}
          >
            <input
              type="radio"
              name="relationship-kind"
              checked={kind === option.id}
              onChange={() => setKind(option.id)}
              className="mt-0.5 h-4 w-4 accent-[#0EA5B7]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{option.label}</span>
              <span className="block text-xs leading-snug text-mist">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {kind === 'partner' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Label>Type</Label>
                <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} className={field}>
                  {PARTNER_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <Label hint="Changes the line style on the board — divorced lines get a break mark.">
                  Status
                </Label>
                <select value={partnerStatus} onChange={(e) => setPartnerStatus(e.target.value)} className={field}>
                  {PARTNER_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Label>Started</Label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
              </label>
              <label className="block">
                <Label>Ended</Label>
                <input
                  type="date"
                  value={endDate}
                  disabled={together}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${field} disabled:bg-paper disabled:text-mist/50`}
                />
              </label>
            </div>
          </>
        )}

        {kind === 'parent' && (
          <label className="block">
            <Label hint="Step, adoptive and foster links draw as a softer dashed line.">Kind of parent</Label>
            <select value={parentType} onChange={(e) => setParentType(e.target.value)} className={field}>
              {PARENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}

        {kind === 'sibling' && (
          <label className="block">
            <Label hint="They'll share a row. Parents can be added later, or not at all.">Kind of siblings</Label>
            <select value={siblingType} onChange={(e) => setSiblingType(e.target.value)} className={field}>
              {SIBLING_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}

        {kind === 'other' && (
          <label className="block">
            <Label>What to call it</Label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Godmother, guardian, best friend…"
              className={field}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose/10 px-3 py-2.5 text-sm text-rose">{error}</p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-2.5 font-medium text-ink transition-colors hover:bg-cyan-wash"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="flex-1 rounded-xl bg-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-cyan-deep"
        >
          Link them
        </button>
      </div>
    </Modal>
  );
}
