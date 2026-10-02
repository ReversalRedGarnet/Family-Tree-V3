import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import PersonModal from './components/PersonModal';
import RelationshipModal from './components/RelationshipModal';
import ExportModal from './components/ExportModal';
import ContextMenu from './components/ContextMenu';
import ConfirmDialog from './components/ConfirmDialog';
import { openModalCount } from './components/Modal';
import ToastStack from './components/ToastStack';
import Tooltip from './components/Tooltip';
import { useFamilyTree } from './hooks/useFamilyTree';
import { useToasts } from './hooks/useToasts';
import { useConfirmQueue } from './hooks/useConfirmQueue';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useDriveSync } from './hooks/useDriveSync';
import {
  validateRelationship,
  describeDeleteImpact,
  collectTreeWarnings,
  findDuplicatePerson,
} from './utils/validation';
import {
  parentsOf,
  activePartnersOf,
  planSiblingMerge,
  inferSiblingType,
  findUnlinkedPartnerChildren,
  partnerChildLinksToWrite,
} from './utils/generations';
import { exportAsPng, exportAsPdf } from './utils/exportTree';
import { saveGraph, downloadRawSave } from './utils/storage';
import { formatName } from './utils/names';
import { MOBILE_BREAKPOINT, exportThemeFor } from './utils/constants';

const CLOSED_MENU = { open: false, x: 0, y: 0, items: [] };
const CLOSED_PERSON = { open: false, mode: 'add', editingId: null, pending: null };
const CLOSED_LINK = { open: false, a: null, b: null, preset: 'partner', error: null, editingId: null };

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Same conversion Canvas.jsx's own right-click handler uses
// (worldX = (screenX - view.x) / view.scale) — read straight off the
// Konva stage node rather than threading pan/zoom state up as new props,
// since the stage already carries its own x/scaleX. Returns null rather
// than a guess when the stage isn't mounted yet, so callers can fall back
// to the board's fixed centre line exactly as they did before.
function viewportCenterWorldX(stage) {
  if (!stage) return null;
  const width = stage.width();
  const scale = stage.scaleX();
  const x = stage.x();
  if (!Number.isFinite(width) || !Number.isFinite(scale) || !scale || !Number.isFinite(x)) {
    return null;
  }
  return (width / 2 - x) / scale;
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
  const { current: confirmState, ask: askConfirm, resolve: resolveConfirm } = useConfirmQueue();
  const [contextMenu, setContextMenu] = useState(CLOSED_MENU);

  const { people, relationships, loadRepairedCount, selectedIds, generation, conflicts } = tree;
  const drive = useDriveSync({
    people,
    relationships,
    replaceGraph: tree.replaceGraph,
    pushToast,
  });

  // Drive found a version it can't reconcile silently — hand it to the
  // person through the same confirm queue everything else uses. If another
  // question is already open, this one waits behind it rather than
  // replacing it. Whichever they pick overwrites the other side; Undo
  // reaches back through it immediately after (and re-syncs, since an
  // undo is just another change), but only until the next reload.
  useEffect(() => {
    if (!drive.conflict) return;
    const savedWhen = drive.conflict.driveSavedAt
      ? new Date(drive.conflict.driveSavedAt).toLocaleString()
      : 'earlier';
    askConfirm({
      title: 'Different tree on Google Drive',
      message: `Drive has a different version of this tree, last saved ${savedWhen}. Whichever you pick overwrites the other — Undo gets you back right after, but not once you reload.`,
      confirmLabel: "Use Drive's version",
      cancelLabel: 'Keep this device',
      onConfirm: () => {
        drive.resolveConflict('use-drive');
      },
      onCancel: () => {
        drive.resolveConflict('keep-local');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive.conflict]);

  const warnings = useMemo(
    () => collectTreeWarnings(people, relationships),
    [people, relationships]
  );

  // The drawer shouldn't be sitting open over the board on a phone.
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // loadRepairedCount is fixed at mount (it reflects a one-time repair
  // loadGraph() already did while loading), so this fires exactly once per
  // page load, never on subsequent edits -- a browser crash mid-write, a
  // bug elsewhere, or someone poking at localStorage by hand can all leave
  // a relationship pointing at a person that's gone; loadGraph() drops
  // those before they ever reach the app, this just says so.
  useEffect(() => {
    if (loadRepairedCount > 0) {
      pushToast("Some data couldn't be loaded and was skipped.", 'warning', 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The save in this browser couldn't be used, so the board started empty.
  // The original is never silently lost: loadGraph() copied it to a backup
  // key, and if even that copy failed, autosave stays paused until the
  // person has downloaded it.
  const { loadIssue } = tree;
  const [saveBlocked, setSaveBlocked] = useState(() => Boolean(loadIssue && !loadIssue.backupKey));
  useEffect(() => {
    if (!loadIssue) return;
    const what =
      loadIssue.status === 'unsupported-version'
        ? 'The tree saved in this browser was made by a different version of this app, so the board starts empty.'
        : "The tree saved in this browser couldn't be read, so the board starts empty.";
    const next = loadIssue.backupKey
      ? ' A copy was kept in this browser — download it to keep it safe.'
      : " Autosave is paused until you download your saved copy, so it isn't overwritten.";
    pushToast(`${what}${next}`, 'warning', 0, {
      label: 'Download it',
      onClick: () => {
        downloadRawSave(loadIssue.raw);
        setSaveBlocked(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisted to this browser only — no account, no sync elsewhere. Runs on
  // every structural change (add, delete, link, drag-end, etc.), not on
  // every keystroke, since those only touch the open form's local state
  // until Save is pressed. Warns once per session rather than on every
  // failed write, so a full/disabled storage doesn't spam toasts.
  const warnedAboutSaveRef = useRef(false);
  const initialGraphRef = useRef({ people, relationships });
  useEffect(() => {
    if (saveBlocked) return;
    // After an unusable load, the empty starting board isn't worth writing
    // over the original -- wait for the first real change.
    const untouched =
      people === initialGraphRef.current.people && relationships === initialGraphRef.current.relationships;
    if (loadIssue && untouched) return;
    const ok = saveGraph({ people, relationships });
    if (!ok && !warnedAboutSaveRef.current && (Object.keys(people).length || Object.keys(relationships).length)) {
      warnedAboutSaveRef.current = true;
      pushToast(
        "This browser won't let the tree autosave — export before closing the tab to be safe.",
        'warning',
        6000
      );
    }
  }, [people, relationships, pushToast, loadIssue, saveBlocked]);

  const closeMenu = useCallback(() => setContextMenu(CLOSED_MENU), []);
  const nameOf = useCallback(
    (id) => {
      const p = people[id];
      return p ? formatName(p) : 'Someone';
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

  // "N links will be removed. M children stay on the board…", for one
  // person or several.
  const deleteImpactText = useCallback(
    (ids, plural) => {
      const { linkCount, childCount } = describeDeleteImpact(ids, people, relationships);
      const details = [];
      if (linkCount) details.push(`${linkCount} link${linkCount > 1 ? 's' : ''} will be removed.`);
      if (childCount) {
        details.push(
          `${childCount} ${childCount > 1 ? 'children stay' : 'child stays'} on the board, just without ${
            plural ? 'these parents' : 'this parent'
          }.`
        );
      }
      return details;
    },
    [people, relationships]
  );

  const requestDeletePerson = useCallback(
    (id) => {
      const person = people[id];
      if (!person) return;
      const details = deleteImpactText([id], false);
      askConfirm({
        title: `Delete ${nameOf(id)}?`,
        message: details.join('\n\n') || 'They have no links, so nothing else changes.',
        danger: true,
        confirmLabel: 'Delete',
        onConfirm: () => {
          tree.deletePerson(id);
          setPersonModal((pm) => (pm.editingId === id ? CLOSED_PERSON : pm));
          pushToast(`${nameOf(id)} deleted.`, 'success', 3000);
        },
      });
    },
    [people, tree, pushToast, nameOf, deleteImpactText]
  );

  const requestDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1) {
      requestDeletePerson(selectedIds[0]);
      return;
    }
    const ids = [...selectedIds];
    askConfirm({
      title: `Delete ${ids.length} people?`,
      message: [`This removes ${ids.map(nameOf).join(', ')}.`, ...deleteImpactText(ids, true)].join('\n\n'),
      danger: true,
      confirmLabel: 'Delete all',
      onConfirm: () => {
        // One commit, so one Undo brings them all back.
        tree.deleteMany(ids);
        setPersonModal((pm) => (ids.includes(pm.editingId) ? CLOSED_PERSON : pm));
        pushToast(`${ids.length} people deleted. Undo brings them all back.`, 'success', 4000);
      },
    });
  }, [selectedIds, tree, pushToast, requestDeletePerson, nameOf, askConfirm, deleteImpactText]);

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

      // Whatever opened the form decides how the new person arrives linked
      // and who they want to sit near. It never picks a side: the slot
      // finder searches outward from the ideal spot and settles ties toward
      // the centre of the board, so nothing has to guess which side is free.
      let buildLinks = null;
      // Right-click "add a person here" — the user pointed at a spot, so
      // that spot is the request.
      let opts = { x: pending.x };

      if (pending.kind === 'child' && pending.parentIds?.length) {
        buildLinks = (id) => pending.parentIds.map((parentId) => ({ kind: 'parent', a: parentId, b: id }));
        // Under the middle of its parents — both of them, when there are two.
        opts = { anchorIds: pending.parentIds };
      } else if (pending.kind === 'parent' && pending.childId) {
        buildLinks = (id) => [{ kind: 'parent', a: id, b: pending.childId }];
        // Directly above the child.
        opts = { anchorIds: [pending.childId] };
      } else if (pending.kind === 'sibling' && pending.siblingId) {
        const shared = parentsOf(pending.siblingId, relationships);
        buildLinks = (id) => {
          // The anchor's own link to the newcomer: parent links to their
          // shared parents when the anchor has any on record (the stronger,
          // more informative fact), otherwise a plain sibling link.
          const initial = shared.length
            ? shared.map((parentId) => ({ kind: 'parent', a: parentId, b: id }))
            : [{ kind: 'sibling', a: pending.siblingId, b: id }];

          // Same transitive guarantee "Link two people" already gets from
          // planSiblingMerge: the newcomer joins the anchor's WHOLE sibling
          // group, not just the anchor. Without this, a newcomer linked to
          // one sibling silently missed any other member of that group who
          // doesn't happen to share the exact same parents (e.g. a half
          // sibling) -- they'd end up with no relationship to the newcomer
          // at all. `relationships` here is the board as it stood before
          // this person existed, which is exactly right: the newcomer truly
          // has no other links yet, however `initial` above ends up
          // representing the anchor pair.
          const anchorType = inferSiblingType(pending.siblingId, id, relationships)?.type || 'full';
          const { pairs, blocked } = planSiblingMerge(pending.siblingId, id, anchorType, relationships);
          // A brand-new person can't already contradict anyone, so this
          // never actually trips -- but planSiblingMerge now checks its own
          // explicit pair regardless of who's calling it, so honour that
          // here too rather than assuming it can't happen.
          if (blocked) return initial;
          // The anchor<->newcomer pair is already covered by `initial`
          // above (as a direct sibling link, or implicitly through shared
          // parentage) -- only the OTHER pairs planSiblingMerge implies are
          // new here.
          const implied = pairs.filter(
            (p) => !((p.a === pending.siblingId || p.b === pending.siblingId) && (p.a === id || p.b === id))
          );
          return [...initial, ...implied];
        };
        // Beside them. A spouse already sitting to the right sends the
        // sibling left, and vice versa, without either side being preferred.
        opts = { anchorIds: [pending.siblingId] };
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
        const who = formatName(duplicate);
        askConfirm({
          title: editing ? 'That matches someone else' : 'You already added this person',
          message: `${who} is already on the board with the same name, gender and year of birth.\n\nIf these really are two different people, carry on — it's worth giving one of them a distinguishing detail so they're easy to tell apart later.`,
          confirmLabel: editing ? 'Save anyway' : 'Add anyway',
          onConfirm: () => {
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
        pushToast(
          isMobile
            ? 'Select two people first — tap one, then tap another (or drag one card onto another).'
            : 'Select two people first — tap one, then shift-tap another (or drag one card onto another).',
          'warning',
          5000
        );
        return;
      }
      setLinkModal({ open: true, a: aId, b: bId, preset, error: null });
    },
    [pushToast, isMobile]
  );

  // Runs down a queue of "is this also their child?" questions one at a
  // time, through the same single confirm-dialog slot every other yes/no
  // in this app already uses (Drive's conflict prompt, every delete
  // confirmation) -- never combined into one question, since a blended
  // family's children don't all have the same answer, and a wrong guess
  // here writes a false parent-child fact. Every accepted answer is
  // collected and written in ONE commit only once the whole queue is
  // empty, the same batching planSiblingMerge and addParentLinks already
  // use: one undo step for the group, not one per child.
  const askAboutSharedChildren = useCallback(
    (queue, accepted) => {
      if (!queue.length) {
        if (accepted.length) {
          tree.addRelationshipBatch(partnerChildLinksToWrite(accepted));
          pushToast(
            accepted.length === 1
              ? `${nameOf(accepted[0].childId)} is now also ${nameOf(accepted[0].candidateParentId)}'s child.`
              : `${accepted.length} additional parent-child links added.`,
            'success',
            4000
          );
        }
        return;
      }

      const [current, ...rest] = queue;
      askConfirm({
        title: 'Also their child?',
        message: `Is ${nameOf(current.childId)} also ${nameOf(current.candidateParentId)}'s child?`,
        confirmLabel: 'Yes',
        cancelLabel: 'No',
        onConfirm: () => askAboutSharedChildren(rest, [...accepted, current]),
        onCancel: () => askAboutSharedChildren(rest, accepted),
      });
    },
    [tree, pushToast, nameOf]
  );

  // Saving the link dialog in edit mode: only the link's own details change.
  // Moving a partnership back to current (together/separated) is checked
  // like a new one would be -- against every OTHER link on the board.
  const handleLinkEdit = useCallback(
    (relId, details, deceasedId) => {
      const rel = relationships[relId];
      if (!rel) {
        setLinkModal(CLOSED_LINK);
        return;
      }
      const others = { ...relationships };
      delete others[relId];
      const check = validateRelationship(rel.kind, rel.a, rel.b, people, others, details);
      if (!check.ok) {
        setLinkModal((m) => ({ ...m, error: check.error }));
        return;
      }
      tree.updateRelationship(relId, details, deceasedId);
      setLinkModal(CLOSED_LINK);
      pushToast('Link updated.', 'success', 2200);
      if (deceasedId && people[deceasedId]?.living !== false) {
        pushToast(`${nameOf(deceasedId)} is now marked as no longer living.`, 'info', 4000);
      }
    },
    [people, relationships, tree, pushToast, nameOf]
  );

  const openEditLink = useCallback(
    (relId) => {
      const rel = relationships[relId];
      if (!rel) return;
      setLinkModal({ open: true, a: rel.a, b: rel.b, preset: rel.kind, error: null, editingId: relId });
    },
    [relationships]
  );

  const handleLinkConfirm = useCallback(
    (kind, aId, bId, details, deceasedId) => {
      if (linkModal.editingId) {
        handleLinkEdit(linkModal.editingId, details, deceasedId);
        return;
      }
      const check = validateRelationship(kind, aId, bId, people, relationships, details);
      if (!check.ok) {
        setLinkModal((m) => ({ ...m, error: check.error }));
        return;
      }

      if (kind === 'sibling') {
        // Siblinghood is transitive: if A is now B's sibling, and B was
        // already recorded as C's sibling, A and C are implicitly siblings
        // too. planSiblingMerge works out every pair that implies, so the
        // whole merge lands in one commit — one undo for the group, not
        // one per pair.
        const { pairs, impliedCount, skipped, blocked } = planSiblingMerge(aId, bId, details.type, relationships);
        // Belt-and-braces: validateRelationship above already rules this
        // out today, but planSiblingMerge checks the explicit pair on its
        // own too now, so a future change to the check above can't quietly
        // let a contradictory sibling link through here.
        if (blocked) {
          setLinkModal((m) => ({ ...m, error: blocked }));
          return;
        }
        tree.addRelationshipBatch(pairs);
        setLinkModal(CLOSED_LINK);
        tree.clearSelection();
        const skippedNote = skipped
          ? ` (${skipped} skipped — already parent/child or partners with someone in the group)`
          : '';
        pushToast(
          impliedCount
            ? `Linked as siblings — and ${impliedCount} other existing sibling${impliedCount > 1 ? 's' : ''} carried across automatically.${skippedNote}`
            : `Linked. The line style shows what kind — see the key in the panel.${skippedNote}`,
          'success',
          5000
        );
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

      if (kind === 'partner') {
        // A blended family: either partner may already have a child on
        // record from before this relationship existed. Never assumed --
        // see askAboutSharedChildren above. Uses the pre-commit
        // `relationships` on purpose: the partner link just written above
        // doesn't change who anyone's existing children are, so planning
        // against the snapshot from before it landed is exactly right,
        // the same way planSiblingMerge plans its merge above.
        //
        // Only children who could actually be the other partner's child
        // are asked about -- checked against the board as it will be once
        // this partnership exists, so a "yes" can never write a link that
        // contradicts someone's generation or ancestry.
        const withPartnership = { ...relationships, pending: { id: 'pending', kind: 'partner', a: aId, b: bId } };
        const candidates = findUnlinkedPartnerChildren(aId, bId, relationships).filter(
          (c) => validateRelationship('parent', c.candidateParentId, c.childId, people, withPartnership).ok
        );
        if (candidates.length) askAboutSharedChildren(candidates, []);
      }
    },
    [people, relationships, tree, pushToast, nameOf, askAboutSharedChildren, linkModal.editingId, handleLinkEdit]
  );

  // Dropping a card onto a parent line or a couple's line adopts the person
  // being dragged into that pair — the dragged card is not a gesture that
  // spawns someone new, it names who the new child actually is. The card
  // still snaps straight back to where it was (nothing is a "move" here),
  // and nothing is written until the confirmation below is accepted — the
  // same rule every other drag-based link on the board follows (dropping
  // one card onto another opens the same kind of confirmation rather than
  // linking instantly).
  const handleDropOnConnector = useCallback(
    (parentIds, draggedId) => {
      const known = parentIds.filter((id) => people[id]);
      if (!known.length || !people[draggedId]) return;

      const checks = known.map((parentId) => ({
        parentId,
        check: validateRelationship('parent', parentId, draggedId, people, relationships),
      }));
      const linkable = checks.filter((c) => c.check.ok).map((c) => c.parentId);
      const blocked = checks.filter((c) => !c.check.ok);

      if (!linkable.length) {
        pushToast(blocked[0]?.check.error || "That link can't be made.", 'warning', 4500);
        return;
      }

      const parentNames = linkable.map(nameOf).join(' and ');
      askConfirm({
        title: `Make ${nameOf(draggedId)} a child of ${parentNames}?`,
        message: blocked.length
          ? `${nameOf(draggedId)} already has a recorded link to ${blocked
              .map((b) => nameOf(b.parentId))
              .join(' and ')}, so only the new link below will be added.\n\nThis adds a parent-and-child link. Generation and row position update to match.`
          : 'This adds a parent-and-child link. Generation and row position update to match.',
        confirmLabel: 'Add link',
        onConfirm: () => {
          tree.addParentLinks(draggedId, linkable);
          pushToast(`${nameOf(draggedId)} is now ${parentNames}'s child.`, 'success', 3500);
        },
      });
    },
    [people, relationships, tree, pushToast, nameOf]
  );

  const handleConflictClick = useCallback(
    (id) => {
      pushToast(
        `${nameOf(id)} has links that contradict each other — for example, two links that put them in different generations. Their row comes from whichever link placed them first; remove or correct the contradicting link to fix it.`,
        'warning',
        7000
      );
    },
    [pushToast, nameOf]
  );

  // A click on a line. Most lines are one link; a child's drop from a
  // parent line carries every parent link that child has (one per parent),
  // so it arrives as a list and each link gets its own named items.
  const handleRelationshipClick = useCallback(
    (relIdOrIds, e) => {
      const rels = [relIdOrIds].flat().map((id) => relationships[id]).filter(Boolean);
      if (!rels.length) return;
      e.cancelBubble = true;
      const remove = (rel) => () => {
        tree.deleteRelationship(rel.id);
        pushToast('Link removed.', 'success', 2200);
      };
      const items =
        rels.length === 1
          ? [
              { label: 'Edit link…', onSelect: () => openEditLink(rels[0].id) },
              {
                label: 'Remove this link',
                danger: true,
                hint: `${nameOf(rels[0].a)} and ${nameOf(rels[0].b)} both stay on the board.`,
                onSelect: remove(rels[0]),
              },
            ]
          : [
              ...rels.map((rel) => ({
                label: `Edit ${nameOf(rel.a)} as ${nameOf(rel.b)}'s parent…`,
                onSelect: () => openEditLink(rel.id),
              })),
              ...rels.map((rel) => ({
                label: `Remove ${nameOf(rel.a)} as ${nameOf(rel.b)}'s parent`,
                danger: true,
                onSelect: remove(rel),
              })),
            ];
      setContextMenu({ open: true, x: e.evt.clientX, y: e.evt.clientY, items });
    },
    [relationships, tree, pushToast, nameOf, openEditLink]
  );

  // ---------- Context menu ----------

  const handlePersonMenu = useCallback(
    (id, clientX, clientY) => {
      const person = people[id];
      if (!person) return;
      const partner = selectedIds.find((sid) => sid !== id);

      // A child gets both parents automatically if there's exactly one
      // CURRENT partner — helpful, but never required, and never assumed
      // onto an ex just because they're still on the board somewhere.
      const activePartners = activePartnersOf(id, relationships);
      const parentIds = activePartners.length === 1 ? [id, activePartners[0]] : [id];

      setContextMenu({
        open: true,
        x: clientX,
        y: clientY,
        items: [
          { label: 'Edit…', onSelect: () => openEditPerson(id) },
          {
            label: partner ? `Link to ${nameOf(partner)}…` : 'Link to another person…',
            hint: partner
              ? undefined
              : isMobile
                ? 'Tap another person, or drag one card onto this one.'
                : 'Shift-click someone else first, or drag one card onto another.',
            onSelect: () => (partner ? openLinkModal(id, partner) : openLinkModal(id, null)),
          },
          { divider: true },
          {
            label: 'Add a parent',
            onSelect: () => openAddPerson({ kind: 'parent', childId: id }),
          },
          {
            label: 'Add a child',
            hint: activePartners.length === 1 ? `Linked to ${nameOf(activePartners[0])} too.` : undefined,
            onSelect: () => openAddPerson({ kind: 'child', parentIds }),
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
      isMobile,
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
      // Set even for the plain "board" template: Canvas only draws its
      // paper background while a theme is set, i.e. while capturing.
      const theme = exportThemeFor(payload.themeId || 'board');
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
      else {
        pushToast(`Saved as ${kind.toUpperCase()}.`, 'success', 2500);
        if (result.warning) pushToast(result.warning, 'warning', 8000);
      }
    },
    [pushToast]
  );

  const requestReset = useCallback(() => {
    askConfirm({
      title: 'Clear the board?',
      message: "Everyone and every link goes, including the saved copy in this browser. Undo still works until you close the tab.",
      danger: true,
      confirmLabel: 'Clear board',
      onConfirm: () => {
        tree.resetAll();
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
        // With any dialog open, Escape belongs to the dialog on top, which
        // closes itself (Modal.jsx). Acting here too used to close the link
        // dialog even when another dialog sat above it, losing its choices.
        if (openModalCount() > 0) return;
        closeMenu();
        if (!typing) tree.clearSelection();
        return;
      }
      if (typing) return;

      // A modal holds an in-progress choice about specific people — the
      // selected two people stay selected behind the link dialog, for
      // instance, so Backspace with focus on a <select> (not "typing" by
      // the check above) would otherwise delete exactly who the dialog is
      // about to link. Undo/redo rewriting the board underneath an open
      // form is the same shape of surprise: it can remove someone the form
      // still references, and the form has no way to know. All three are
      // blocked outright while any of these is open, not only while a text
      // field has focus.
      const modalOpen =
        personModal.open || linkModal.open || Boolean(confirmState) || exportModal.open;
      if (modalOpen) return;

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
  }, [
    tree,
    selectedIds,
    requestDeleteSelected,
    closeMenu,
    personModal.open,
    linkModal.open,
    confirmState,
    exportModal.open,
  ]);

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
      onAddPerson={() => openAddPerson({ kind: 'root', x: viewportCenterWorldX(stageRef.current) })}
      onEditPerson={openEditPerson}
      onPersonMenu={handlePersonMenu}
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
      drive={drive}
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
          onSelectMany={tree.selectMany}
          onMovePerson={tree.movePerson}
          onMoveMany={tree.moveMany}
          onEditPerson={openEditPerson}
          onPersonContextMenu={handlePersonMenu}
          onCanvasContextMenu={handleBoardMenu}
          onDropOverlap={(aId, bId) => openLinkModal(aId, bId, 'partner')}
          onDropOnConnector={handleDropOnConnector}
          onRelationshipClick={handleRelationshipClick}
          onAddFirstPerson={() => openAddPerson({ kind: 'root', x: viewportCenterWorldX(stageRef.current) })}
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
        onEditRelationship={openEditLink}
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
        editing={linkModal.editingId ? relationships[linkModal.editingId] : null}
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
        // A new question remounts the dialog, so focus starts on its Cancel
        // button again instead of staying on the button just pressed.
        key={confirmState?.id ?? 'none'}
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        onConfirm={() => resolveConfirm('onConfirm')}
        // Runs the question's own onCancel when it has one (the Drive
        // conflict's "keep this device", the shared-child "No"); otherwise
        // dismissing it is the whole answer.
        onCancel={() => resolveConfirm('onCancel')}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
