import { useMemo, useState } from 'react';
import Tooltip from './Tooltip';
import Legend from './Legend';

function fullName(person) {
  return `${person.firstName || 'Unnamed'} ${person.lastName || ''}`.trim();
}

function Action({ label, detail, onClick, disabled, tone = 'quiet', children, collapsed }) {
  const tones = {
    primary: 'bg-cyan text-white hover:bg-cyan-deep',
    accent: 'bg-cyan-wash text-cyan-deep hover:bg-cyan-soft/50',
    quiet: 'bg-white text-ink border border-hairline hover:bg-cyan-wash',
    danger: 'bg-white text-rose border border-hairline hover:bg-rose/10',
  };

  return (
    <Tooltip
      label={label}
      detail={detail}
      placement={collapsed ? 'bottom' : 'top'}
      className={collapsed ? '' : 'w-full'}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
          tones[tone]
        } ${collapsed ? 'h-10 w-10 p-0' : 'w-full'}`}
      >
        <span aria-hidden="true">{children}</span>
        {!collapsed && <span>{label}</span>}
      </button>
    </Tooltip>
  );
}

function Section({ title, hint, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-hairline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">{title}</span>
        <span className={`text-mist transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          ⌃
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {hint && <p className="mb-2.5 text-xs leading-relaxed text-mist">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  people,
  relationships,
  selectedIds,
  generation,
  warnings = [],
  collapsed,
  isMobile,
  onToggleCollapse,
  onSelect,
  onAddPerson,
  onEditPerson,
  onLinkSelected,
  onRequestExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onTidyRows,
  onRequestReset,
}) {
  const roster = useMemo(() => {
    const groups = new Map();
    Object.values(people).forEach((person) => {
      const gen = generation?.[person.id] ?? 0;
      if (!groups.has(gen)) groups.set(gen, []);
      groups.get(gen).push(person);
    });
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gen, list]) => [gen, list.sort((a, b) => fullName(a).localeCompare(fullName(b)))]);
  }, [people, generation]);

  const personCount = Object.keys(people).length;
  const linkCount = Object.keys(relationships).length;
  const railed = collapsed && !isMobile;

  // Collapsed desktop rail: icons only, every one carrying its tooltip.
  if (railed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-hairline bg-white py-3">
        <Tooltip label="Expand the panel" placement="bottom">
          <button
            onClick={onToggleCollapse}
            aria-label="Expand the panel"
            aria-expanded="false"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-cyan-wash"
          >
            »
          </button>
        </Tooltip>
        <div className="my-1 h-px w-7 bg-hairline" />
        <Action label="Add person" detail="Drop a new card on the board." onClick={onAddPerson} tone="primary" collapsed>+</Action>
        <Action label="Link two people" detail="Select two, then pick how they're related." onClick={onLinkSelected} tone="accent" collapsed>⇄</Action>
        <Action label="Undo" onClick={onUndo} disabled={!canUndo} collapsed>↶</Action>
        <Action label="Redo" onClick={onRedo} disabled={!canRedo} collapsed>↷</Action>
        <Action label="Tidy the layout" detail="Re-flows every card back into generation rows." onClick={onTidyRows} collapsed>⊞</Action>
        <Action label="Export" detail="Save the board as a PNG or PDF." onClick={onRequestExport} tone="accent" collapsed>↓</Action>
        <div className="flex-1" />
        <Action label="Clear the board" onClick={onRequestReset} tone="danger" collapsed>⌫</Action>
      </aside>
    );
  }

  return (
    <aside className="thin-scroll flex h-full w-full flex-col overflow-y-auto bg-white sm:w-72 sm:border-r sm:border-hairline">
      <header className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h1 className="font-display text-xl leading-tight text-ink">Family Tree</h1>
          <p className="mt-0.5 text-xs text-mist">
            Nothing is saved — export before you close the tab.
          </p>
        </div>
        <Tooltip label={isMobile ? 'Close the panel' : 'Collapse the panel'} placement="bottom">
          <button
            onClick={onToggleCollapse}
            aria-label={isMobile ? 'Close the panel' : 'Collapse the panel'}
            aria-expanded="true"
            className="-mr-1 rounded-lg px-2 py-1 text-mist transition-colors hover:bg-cyan-wash hover:text-ink"
          >
            {isMobile ? '×' : '«'}
          </button>
        </Tooltip>
      </header>

      <div className="space-y-2 px-4 pb-4">
        <Action label="Add person" detail="Drops a new card on the board." onClick={onAddPerson} tone="primary">+</Action>
        <Action
          label="Link two people"
          detail="Select two people, then choose how they're related."
          onClick={onLinkSelected}
          tone="accent"
        >
          ⇄
        </Action>

        <div className="flex gap-2">
          <Action label="Undo" onClick={onUndo} disabled={!canUndo}>↶</Action>
          <Action label="Redo" onClick={onRedo} disabled={!canRedo}>↷</Action>
        </div>

        <Action
          label="Tidy the layout"
          detail="Re-flows every card back into its generation row. Cards you've dragged are released too."
          onClick={onTidyRows}
        >
          ⊞
        </Action>
        <Action label="Export" detail="Save the board as a PNG or PDF." onClick={onRequestExport} tone="accent">↓</Action>
      </div>

      <div className="flex gap-4 border-t border-hairline px-4 py-2.5 font-mono text-[11px] text-mist">
        <span>{personCount} people</span>
        <span>{linkCount} links</span>
        <span>{selectedIds.length} selected</span>
      </div>

      <Section
        title={`Everyone (${personCount})`}
        hint={
          personCount === 0
            ? undefined
            : 'Tap to select. Shift-tap to add a second person, then use Link two people.'
        }
      >
        {personCount === 0 ? (
          <p className="text-xs leading-relaxed text-mist">
            No one here yet. Add a person, then drag one card onto another to link them.
          </p>
        ) : (
          <div className="space-y-3">
            {roster.map(([gen, list]) => (
              <div key={gen}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  Generation {gen + 1}
                </p>
                <div className="space-y-1">
                  {list.map((person) => (
                    <button
                      key={person.id}
                      onClick={(e) => onSelect(person.id, e.shiftKey)}
                      onDoubleClick={() => onEditPerson(person.id)}
                      title="Tap to select · double-tap to edit"
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selectedIds.includes(person.id)
                          ? 'bg-cyan text-white'
                          : 'text-ink hover:bg-cyan-wash'
                      }`}
                    >
                      <span className="flex-1 truncate">{fullName(person)}</span>
                      {person.living === false && (
                        <span
                          className={`shrink-0 font-mono text-[10px] ${
                            selectedIds.includes(person.id) ? 'text-white/80' : 'text-slate-quiet'
                          }`}
                        >
                          ✝
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="What the lines mean" defaultOpen={false}>
        <Legend />
      </Section>

      {warnings.length > 0 && (
        <Section title={`Worth a look (${warnings.length})`} hint="Nothing here blocks you — just dates that look odd.">
          <ul className="space-y-2">
            {warnings.map((w, i) => (
              <li key={`${w.personId}-${i}`}>
                <button
                  onClick={() => onSelect(w.personId)}
                  className="text-left text-xs leading-snug text-mist transition-colors hover:text-ink"
                >
                  <span className="font-medium text-cyan-deep">{w.name}</span> — {w.message}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-auto border-t border-hairline p-4">
        <Action label="Clear the board" detail="Removes everyone. Undo still works." onClick={onRequestReset} tone="danger">
          ⌫
        </Action>
      </div>
    </aside>
  );
}
