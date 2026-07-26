import { LINE_STYLES } from '../utils/constants';

// The key and the board share one vocabulary — these glyphs are drawn to
// match RelationshipLines exactly.
function Glyph({ styleKey }) {
  const s = LINE_STYLES[styleKey];
  const dash = s.dash ? s.dash.join(' ') : undefined;
  const mid = 22;

  return (
    <svg width="44" height="18" viewBox="0 0 44 18" className="shrink-0" aria-hidden="true">
      {styleKey === 'sibling' ? (
        <path
          d="M6 16 V8 Q6 5 9 5 H35 Q38 5 38 8 V16"
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1="3"
          y1="9"
          x2="41"
          y2="9"
          stroke={s.color}
          strokeWidth={s.width}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      )}

      {s.marker === 'ring-filled' && (
        <>
          <circle cx={mid} cy="9" r="6" fill={s.color} />
          <circle cx={mid} cy="9" r="2.2" fill="#fff" />
        </>
      )}
      {s.marker === 'ring-open' && (
        <circle cx={mid} cy="9" r="5.5" fill="#fff" stroke={s.color} strokeWidth="2" />
      )}
      {s.marker === 'dot' && <circle cx={mid} cy="9" r="3.4" fill={s.color} />}
      {s.marker === 'break' && (
        <>
          <line x1={mid - 6} y1="15" x2={mid - 1} y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
          <line x1={mid + 1} y1="15" x2={mid + 6} y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {styleKey === 'parent' && <circle cx="41" cy="9" r="2.6" fill={s.color} />}
    </svg>
  );
}

const ROWS = [
  'marriage',
  'partner',
  'engaged',
  'separated',
  'divorced',
  'widowed',
  'parent',
  'parentSoft',
  'sibling',
  'other',
];

export default function Legend() {
  return (
    <ul className="space-y-1.5">
      {ROWS.map((key) => (
        <li key={key} className="flex items-center gap-2.5">
          <Glyph styleKey={key} />
          <span className="text-xs text-mist">{LINE_STYLES[key].label}</span>
        </li>
      ))}
      <li className="flex items-center gap-2.5 pt-1">
        <span className="flex h-[18px] w-11 shrink-0 items-end justify-center">
          <span className="h-2.5 w-9 rounded-sm bg-slate-quiet" />
        </span>
        <span className="text-xs text-mist">Deceased</span>
      </li>
    </ul>
  );
}
