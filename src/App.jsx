import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import PersonModal from './components/PersonModal';
import RelationshipModal from './components/RelationshipModal';
import ExportModal from './components/ExportModal';
import ContextMenu from './components/ContextMenu';
import ConfirmDialog from './components/ConfirmDialog';
import ToastStack from './components/ToastStack';
import Tooltip from './components/Tooltip';
import { useFamilyTree } from './hooks/useFamilyTree';
import { useToasts } from './hooks/useToasts';
import { useMediaQuery } from './hooks/useMediaQuery';
import {
  validateRelationship,
  describeDeleteImpact,
  collectTreeWarnings,
  findDuplicatePerson,
} from './utils/validation';
import { parentsOf, partnersOf } from './utils/generations';
import { exportAsPng, exportAsPdf } from './utils/exportTree';
import { saveGraph } from './utils/storage';
import { MOBILE_BREAKPOINT, exportThemeFor } from './utils/constants';

const CLOSED_MENU = { open: false, x: 0, y: 0, items: [] };
const CLOSED_PERSON = { open: false, mode: 'add', editingId: null, pending: null };
const CLOSED_LINK = { open: false, a: null, b: null, preset: 'partner', error: null };

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export default function App() {
  const tree = useFamilyTree();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const stageRef = useRef(null);
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [personModal, setPersonModal] = useState(CLOSED_PERSON);
  const [linkModal, setLinkModal] = useState(CLOSED_LINK);
  const [exportModal, setExportModal] = useState({ open: false, busy: false });
  const [exportMemo, setExportMemo] = useState(null);
  const [activeExportTheme, setActiveExportTheme] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [contextMenu, setContextMenu] = useState(CLOSED_MENU);

  const { people, relationships, selectedIds, generation, conflicts } = tree;
  const warnings = useMemo(
    () => collectTreeWarnings(people, relationships),
    [people, relationships]
  );

  // The drawer shouldn't be sitting open over the board on a phone.
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Persisted to this browser only — no account, no sync elsewhere. Runs on
  // every structural change (add, delete, link, drag-end, etc.), not on
  // every keystroke, since those only touch the open form's local state
  // until Save is pressed. Warns once per session rather than on every
  // failed write, so a full/disabled storage doesn't spam toasts.
  const warnedAboutSaveRef = useRef(false);
  useEffect(() => {
    const ok = saveGraph({ people, relationships });
    if (!ok && !warnedAboutSaveRef.current && (Object.keys(people).length || Object.keys(relationships).length)) {
      warnedAboutSaveRef.current = true;
      pushToast(
        "This browser won't let the tree autosave — export before closing the tab to be safe.",
        'warning',
        6000
      );
    }
  }, [people, relationships, pushToast]);

  const closeMenu = useCallback(() => setContextMenu(CLOSED_MENU), []);
  const nameOf = useCallback(
    (id) => {
      const p = people[id];
      return p ? `${p.firstName} ${p.lastName}`.trim() || 'Unnamed' : 'Someone';
    },
    [people]
  );

  // ---------- People ----------

  const openAddPerson = useCallback((pending) => {
    setPersonModal({ open: true, mode: 'add', editingId: null, pending });
    setContextMenu(CLOSED_MENU);
  }, []);

  const openEditPerson = useCallback(
    (id) => {
      if (!people[id]) return;
      setPersonModal({ open: true, mode: 'edit', editingId: id, pending: null });
    },
    [people]
  );

  const requestDeletePerson = useCallback(
    (id) => {
      const person = people[id];
      if (!person) return;
      const { linkCount, childCount } = describeDeleteImpact(id, people, relationships);
      const details = [];
      if (linkCount) details.push(`${linkCount} link${linkCount > 1 ? 's' : ''} will be removed.`);
      if (childCount) {
        details.push(
          `${childCount} ${childCount > 1 ? 'children stay' : 'child stays'} on the board, just without this parent.`
        );
      }
      setConfirmState({
        title: `Delete ${nameOf(id)}?`,
        message: details.join('\n\n') || 'They have no links, so nothing else changes.',
        danger: true,
        confirmLabel: 'Delete',
        onConfirm: () => {
          tree.deletePerson(id);
          setPersonModal((pm) => (pm.editingId === id ? CLOSED_PERSON : pm));
          setConfirmState(null);
          pushToast(`${nameOf(id)} deleted.`, 'success', 3000);
        },
      });
    },
    [people, relationships, tree, pushToast, nameOf]
  );

  const requestDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1) {
      requestDeletePerson(selectedIds[0]);
      return;
    }
    setConfirmState({
      title: `Delete ${selectedIds.length} people?`,
      message: `This removes ${selectedIds.map(nameOf).join(', ')} and every link they have.`,
      danger: true,
      confirmLabel: 'Delete all',
      onConfirm: () => {
        selectedIds.forEach((id) => tree.deletePerson(id));
        setConfirmState(null);
        pushToast('Deleted.', 'success', 3000);
      },
    });
  }, [selectedIds, tree, pushToast, requestDeletePerson, nameOf]);

  // The actual write, once any duplicate question has been settled.
  const commitPersonSave = useCallback(
    (formData) => {
      if (personModal.mode === 'edit') {
        tree.updatePerson(personModal.editingId, formData);
        setPersonModal(CLOSED_PERSON);
        pushToast('Saved.', 'success', 1800);
        return;
      }

      const pending = personModal.pending || {};

      // Whatever opened the form decides how the new person arrives linked,
      // and which side of their anchor they should try to sit on.
      let buildLinks = null;
      let opts = { nearX: pending.x };

      if (pending.kind === 'child' && pending.parentIds?.length) {
        buildLinks = (id) => pending.parentIds.map((parentId) => ({ kind: 'parent', a: parentId, b: id }));
        opts = { anchorId: pending.anchorId, prefer: ['center', 'right', 'left'] };
      } else if (pending.kind === 'parent' && pending.childId) {
        buildLinks = (id) => [{ kind: 'parent', a: id, b: pending.childId }];
        opts = { anchorId: pending.childId, prefer: ['center', 'right', 'left'] };
      } else if (pending.kind === 'sibling' && pending.siblingId) {
        const shared = parentsOf(pending.siblingId, relationships);
        buildLinks = (id) =>
          shared.length
            ? shared.map((parentId) => ({ kind: 'parent', a: parentId, b: id }))
            : [{ kind: 'sibling', a: pending.siblingId, b: id }];
        // Beside them, on whichever side is free — a spouse already sitting
        // to the right pushes the sibling to the left, and vice versa.
        opts = { anchorId: pending.siblingId, prefer: ['right', 'left'] };
      }

      tree.addRelative(formData, buildLinks, opts);
      setPersonModal(CLOSED_PERSON);
      pushToast('Person added.', 'success', 2000);
    },
    [personModal, tree, relationships, pushToast]
  );

  // Catches the accidental second copy before it lands. The form stays open
  // behind the question, so backing out leaves the details there to edit.
  const handlePersonSave = useCallback(
    (formData) => {
      const editing = personModal.mode === 'edit';
      const duplicate = findDuplicatePerson(formData, people, editing ? personModal.editingId : null);

      if (duplicate) {
        const who = `${duplicate.firstName} ${duplicate.lastName}`.trim() || 'Unnamed';
        setConfirmState({
          title: editing ? 'That matches someone else' : 'You already added this person',
          message: `${who} is already on the board with the same name, gender and year of birth.\n\nIf these really are two different people, carry on — it's worth giving one of them a distinguishing detail so they're easy to tell apart later.`,
          confirmLabel: editing ? 'Save anyway' : 'Add anyway',
          onConfirm: () => {
            setConfirmState(null);
            commitPersonSave(formData);
          },
        });
        return;
      }

      commitPersonSave(formData);
    },
    [personModal, people, commitPersonSave]
  );

  // ---------- Relationships ----------

  const openLinkModal = useCallback(
    (aId, bId, preset = 'partner') => {
      if (!aId || !bId) {
        pushToast('Select two people first — tap one, then shift-tap another.', 'warning', 5000);
        return;
      }
      setLinkModal({ open: true, a: aId, b: bId, preset, error: null });
    },
    [pushToast]
  );

  const handleLinkConfirm = useCallback(
    (kind, aId, bId, details, deceasedId) => {
      const check = validateRelationship(kind, aId, bId, people, relationships);
      if (!check.ok) {
        setLinkModal((m) => ({ ...m, error: check.error }));
        return;
      }
      if (deceasedId) {
        // One step, so the link and the loss can't get out of sync.
        tree.addPartnerWithLoss(aId, bId, details, deceasedId);
        pushToast(`${nameOf(deceasedId)} is now marked as no longer living.`, 'info', 4000);
      } else {
        tree.addRelationship(kind, aId, bId, details);
      }
      setLinkModal(CLOSED_LINK);
      tree.clearSelection();
      pushToast('Linked. The line style shows what kind — see the key in the panel.', 'success', 4000);
    },
    [people, relationships, tree, pushToast, nameOf]
  );

  const handleConflictClick = useCallback(
    (id) => {
      pushToast(
        `${nameOf(id)} has a relationship that contradicts itself — for example, a link that would make them their own ancestor. They're pinned to row 0 until the conflicting link is removed or corrected.`,
        'warning',
        7000
      );
    },
    [pushToast, nameOf]
  );

  const handleRelationshipClick = useCallback(
    (relId, e) => {
      const rel = relationships[relId];
      if (!rel) return;
      e.cancelBubble = true;
      setContextMenu({
        open: true,
        x: e.evt.clientX,
        y: e.evt.clientY,
        items: [
          {
            label: 'Remove this link',
            danger: true,
            hint: `${nameOf(rel.a)} and ${nameOf(rel.b)} both stay on the board.`,
            onSelect: () => {
              tree.deleteRelationship(relId);
              pushToast('Link removed.', 'success', 2200);
            },
          },
        ],
      });
    },
    [relationships, tree, pushToast, nameOf]
  );

  // ---------- Context menu ----------

  const handlePersonMenu = useCallback(
    (id, clientX, clientY) => {
      const person = people[id];
      if (!person) return;
      const partner = selectedIds.find((sid) => sid !== id);

      // A child gets both parents automatically if there's exactly one
      // partner — helpful, but never required.
      const partners = partnersOf(id, relationships);
      const parentIds = partners.length === 1 ? [id, partners[0]] : [id];

      setContextMenu({
        open: true,
        x: clientX,
        y: clientY,
        items: [
          { label: 'Edit…', onSelect: () => openEditPerson(id) },
          {
            label: partner ? `Link to ${nameOf(partner)}…` : 'Link to another person…',
            hint: partner ? undefined : 'Shift-click someone else first, or drag one card onto another.',
            onSelect: () => (partner ? openLinkModal(id, partner) : openLinkModal(id, null)),
          },
          { divider: true },
          {
            label: 'Add a parent',
            onSelect: () => openAddPerson({ kind: 'parent', childId: id }),
          },
          {
            label: 'Add a child',
            hint: partners.length === 1 ? `Linked to ${nameOf(partners[0])} too.` : undefined,
            onSelect: () => openAddPerson({ kind: 'child', parentIds, anchorId: id }),
          },
          {
            label: 'Add a sibling',
            onSelect: () => openAddPerson({ kind: 'sibling', siblingId: id }),
          },
          { divider: true },
          { label: 'Delete', danger: true, onSelect: () => requestDeletePerson(id) },
        ],
      });
    },
    [
      people,
      relationships,
      selectedIds,
      openEditPerson,
      openLinkModal,
      openAddPerson,
      requestDeletePerson,
      nameOf,
    ]
  );

  const handleBoardMenu = useCallback(
    (clientX, clientY, worldX) => {
      setContextMenu({
        open: true,
        x: clientX,
        y: clientY,
        items: [{ label: 'Add a person here', onSelect: () => openAddPerson({ kind: 'root', x: worldX }) }],
      });
    },
    [openAddPerson]
  );

  // ---------- Export ----------

  const runExport = useCallback(
    async (kind, payload) => {
      setExportModal({ open: true, busy: true });
      setExportMemo(payload.memo);
      // The template only ever exists for this one capture — the modal's
      // backdrop is covering the board the whole time, so nobody watches
      // it happen, and it's always put back afterward, success or not.
      const theme = payload.themeId && payload.themeId !== 'board' ? exportThemeFor(payload.themeId) : null;
      setActiveExportTheme(theme);
      await nextPaint();
      const result = await (kind === 'pdf' ? exportAsPdf : exportAsPng)(
        stageRef.current,
        payload.fileName
      );
      setActiveExportTheme(null);
      setExportMemo(null);
      setExportModal({ open: false, busy: false });
      if (!result.ok) pushToast(result.error, 'error');
      else pushToast(`Saved as ${kind.toUpperCase()}.`, 'success', 2500);
    },
    [pushToast]
  );

  const requestReset = useCallback(() => {
    setConfirmState({
      title: 'Clear the board?',
      message: "Everyone and every link goes, including the saved copy in this browser. Undo still works until you close the tab.",
      danger: true,
      confirmLabel: 'Clear board',
      onConfirm: () => {
        tree.resetAll();
        setConfirmState(null);
        pushToast('Board cleared.', 'success', 2200);
      },
    });
  }, [tree, pushToast]);

  // ---------- Keyboard ----------

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if (e.key === 'Escape') {
        closeMenu();
        setLinkModal(CLOSED_LINK);
        if (!typing) tree.clearSelection();
        return;
      }
      if (typing) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        tree.undo();
      } else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        tree.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        requestDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tree, selectedIds, requestDeleteSelected, closeMenu]);

  const sidebar = (
    <Sidebar
      people={people}
      relationships={relationships}
      selectedIds={selectedIds}
      generation={generation}
      warnings={warnings}
      collapsed={!sidebarOpen}
      isMobile={isMobile}
      onToggleCollapse={() => setSidebarOpen((v) => !v)}
      onSelect={tree.select}
      onAddPerson={() => openAddPerson({ kind: 'root' })}
      onEditPerson={openEditPerson}
      onLinkSelected={() => openLinkModal(selectedIds[0], selectedIds[1])}
      onRequestExport={() => setExportModal({ open: true, busy: false })}
      onUndo={tree.undo}
      onRedo={tree.redo}
      canUndo={tree.canUndo}
      canRedo={tree.canRedo}
      onTidyRows={() => {
        tree.tidyRows();
        pushToast('Everyone re-flowed into generation rows.', 'success', 2500);
      }}
      onRequestReset={requestReset}
    />
  );

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-paper">
      {/* Desktop: inline panel that collapses to a rail. */}
      {!isMobile && sidebar}

      {/* Phone: the panel slides over the board instead of squeezing it. */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="w-[86vw] max-w-xs bg-white shadow-lift">{sidebar}</div>
          <button
            aria-label="Close the panel"
            onClick={() => setSidebarOpen(false)}
            className="flex-1 bg-ink/40 backdrop-blur-[1px]"
          />
        </div>
      )}

      <main className="relative min-w-0 flex-1">
        {isMobile && !sidebarOpen && (
          <Tooltip label="Open the panel" placement="bottom">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open the panel"
              className="absolute left-3 top-3 z-30 flex h-11 items-center gap-2 rounded-xl border border-hairline bg-white/95 px-3.5 font-medium text-ink shadow-card backdrop-blur"
            >
              <span aria-hidden="true">☰</span>
              <span className="text-sm">Menu</span>
            </button>
          </Tooltip>
        )}

        <Canvas
          ref={stageRef}
          people={people}
          relationships={relationships}
          conflicts={conflicts}
          selectedIds={selectedIds}
          memo={exportMemo}
          onSelect={tree.select}
          onMovePerson={tree.movePerson}
          onEditPerson={openEditPerson}
          onPersonContextMenu={handlePersonMenu}
          onCanvasContextMenu={handleBoardMenu}
          onDropOverlap={(aId, bId) => openLinkModal(aId, bId, 'partner')}
          onRelationshipClick={handleRelationshipClick}
          onAddFirstPerson={() => openAddPerson({ kind: 'root' })}
          onConflictClick={handleConflictClick}
          exportTheme={activeExportTheme}
        />
      </main>

      <PersonModal
        open={personModal.open}
        mode={personModal.mode}
        initialPerson={personModal.editingId ? people[personModal.editingId] : null}
        people={people}
        relationships={relationships}
        onSave={handlePersonSave}
        onCancel={() => setPersonModal(CLOSED_PERSON)}
        onRequestDelete={
          personModal.mode === 'edit' ? () => requestDeletePerson(personModal.editingId) : undefined
        }
        onDeleteRelationship={(relId) => {
          tree.deleteRelationship(relId);
          pushToast('Link removed.', 'success', 2200);
        }}
      />

      <RelationshipModal
        open={linkModal.open}
        personA={linkModal.a}
        personB={linkModal.b}
        people={people}
        relationships={relationships}
        presetKind={linkModal.preset}
        error={linkModal.error}
        onConfirm={handleLinkConfirm}
        onCancel={() => setLinkModal(CLOSED_LINK)}
      />

      <ExportModal
        open={exportModal.open}
        busy={exportModal.busy}
        onExportPng={(payload) => runExport('png', payload)}
        onExportPdf={(payload) => runExport('pdf', payload)}
        onCancel={() => setExportModal({ open: false, busy: false })}
      />

      <ContextMenu {...contextMenu} onClose={closeMenu} />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
