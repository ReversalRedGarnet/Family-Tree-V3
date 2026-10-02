# Family-Tree-V3 — Audit

Audited 2026-10-02 against commit `e5c2a94` (branch `main`, clean tree). Phase 1 was read-only: no source file was changed. Everything below was checked against the code, and most of it was also checked by running the app. "Confirmed" means I reproduced it. "Suspected" means I traced it in the code but could not run it, and each one says what would confirm it.

**How I verified things**
- Ran `npm install`, `npm run build`, `npm test`, `npm audit`, `npm outdated` and `npm run preview`.
- Ran a production build with `VITE_BASE_PATH=/Family-Tree-V3/` and served it from `/<repo>/` with a plain static server, the same way GitHub Pages serves it.
- Used scripted Playwright sessions against the preview build to test persistence, export, keyboard/focus and canvas input.
- Ran a `vite-node` probe script against the pure modules.
- Wrote a scripted family generator and timed trees of 150 and 500 people.
- Computed WCAG contrast ratios for the theme colours.

---

## 0. Architecture (Phase 0 orientation)

- **Entry:** `index.html` loads `src/index.jsx`, which mounts `<App/>` inside `<ErrorBoundary>` under `StrictMode`. Tailwind is applied through `src/index.css`.
- **State:** `hooks/useFamilyTree.js` holds one `{ past, present, future }` history object. `present` is `{ people: {id→person}, relationships: {id→{id,kind,a,b,…}} }`. Selection is separate, untracked state.
- **Mutations:** every mutation goes through `commit(producer, {layout, hint, history})`. The producer returns the next graph, then `autoLayout` (layout.js) assigns rows and resolves X collisions, then `applyCommit` (history.js) pushes onto `past` (capped at 50) and clears `future`.
- **Generations:** `computeGenerations` (generations.js) is a BFS over parent (±1), partner (0) and sibling (0) edges. Each connected group is normalised to start at row 0, and contradictions are flagged in `conflicts`.
- **Loading:** at mount the hook seeds `present` from `storage.loadGraph()`. App.jsx then autosaves `{people, relationships}` to localStorage on every change through an effect.
- **App.jsx** is the orchestrator. It owns the modal state (person, link, export, a single `confirmState` slot, context menu) and all the "business" handlers: link validation (`validation.js`), sibling-merge planning, adopting by dropping onto a line, the delete-impact text, export, and keyboard shortcuts.
- **Canvas.jsx** is a Konva `Stage` with one `Layer`. It handles pan/zoom (all by hand), marquee select, drag-to-link hit tests (`connectors.js`) and group drag. It draws `RelationshipLines` and a memoised `PersonNode` per person, and calls back into App.
- **Sidebar.jsx** contains the roster grouped by generation, which has the only keyboard path to the per-person ⋯ menu. It also holds the add/link/undo/tidy/export/reset buttons, the legend, warnings and the Drive status.
- **Modals:** `PersonModal`, `RelationshipModal`, `ExportModal` and `ConfirmDialog` all share the `Modal` shell (focus trap, Escape, focus restore). `ContextMenu` and `ToastStack` are separate.
- **Export:** `exportTree.js` snapshots the stage layer with `toDataURL`. For PDF it lazily imports jsPDF and places that image on one A4 page. During capture, App temporarily passes a memo text and an "export theme" into Canvas.
- **Drive sync (optional, off by default):** `useDriveSync` and `driveSync.js` handle GIS token, appData file, handshake (`decideSyncAction`), debounced push with retry, and a conflict prompt routed through App's `confirmState`.
- **Deploy:** `deploy.yml` builds with `VITE_BASE_PATH=/<repo>/` and publishes `dist/` with the Pages actions.

---

## 1. Executive summary

**Overall health.** The pure-logic core is well separated and well tested: 97/97 tests pass, layout is deterministic, history is pure, and there are no XSS sinks.

**The serious problems are at the edges.**
- **Persistence:** one corrupt or wrong-version save wipes the user's tree. One bad record crashes the app permanently.
- **Export:** silently produces an empty file for large trees.
- **Model validation:** misses whole classes of contradictory links.
- **Layout:** the README's promise that "dragged cards stay put" does not hold.

**Elsewhere:**
- **Build and deploy:** both work under a subpath. Fonts and lazy chunks resolve.
- **CI:** runs no tests, and pins a Node version that is end-of-life and below what jsdom needs.
- **Accessibility:** several confirmed focus and labelling defects, and contrast failures on the primary buttons.
- **README:** contains about 20 stale or false statements.

**Top 5**
1. **C1** — A corrupt or other-version localStorage save is silently overwritten with an empty board on first load. The data is lost permanently.
2. **C2** — A single `null` person in the saved data crashes render on every load. "Reload the page" loops, and the app stays bricked until site data is cleared.
3. **H1** — PNG/PDF export of a large tree at normal zoom downloads a 0-byte file and shows "Saved as PNG." Export resolution also depends on the current zoom.
4. **H4** — `validateRelationship` lets through links that contradict generations: a parent link between partners or siblings, a grandparent partnered with a grandchild, and sibling merges across generations. These produce conflict badges through normal UI paths.
5. **H5** — You cannot record an ex-spouse once a current spouse exists. There is also no way to edit a link's status, so "end the first one" means deleting it and re-creating it.

---

## 2. Findings table

| ID | Area | Sev | File:line | Summary | Status |
|---|---|---|---|---|---|
| C1 | Persistence | Critical | src/utils/storage.js:52,58 · src/App.jsx:138 | Unreadable or other-version save is overwritten with an empty graph on first render | confirmed |
| C2 | Persistence | Critical | src/utils/storage.js:53 · src/components/Canvas.jsx:211 | `null`/non-object person crashes render; reload loops; app bricked | confirmed |
| H1 | Export | High | src/utils/exportTree.js:9-24,38-40 | Oversized canvas gives a 0-byte PNG/PDF with a success toast; resolution depends on zoom | confirmed |
| H2 | Layout | High | src/utils/layout.js:144-194 · src/hooks/useFamilyTree.js:165 | Hand-dragged cards closer than 201 px "jump" on the next unrelated edit | confirmed |
| H3 | Layout | High | src/components/PersonNode.jsx:99-106 | Cards drag freely in Y, sit on other rows and overlap undetected (README says row-locked) | confirmed |
| H4 | Model | High | src/utils/validation.js:39-43 · src/utils/generations.js:289 | No generation-consistency check; contradictory links accepted through normal UI | confirmed |
| H5 | Model/UX | High | src/utils/validation.js:74-87 · src/App.jsx:502-525 | Can't add an ended partnership while a current one exists; no way to edit link status | confirmed |
| M1 | A11y | Medium | src/components/Modal.jsx:74 · src/App.jsx:783,802,810 | Modal effect re-runs on every App render, so focus jumps to × | confirmed |
| M2 | A11y | Medium | src/components/Modal.jsx:38-67 | Stacked modals fight over Tab; keyboard can't reach "Add anyway" | confirmed |
| M3 | A11y | Medium | src/components/PersonModal.jsx:16-23 · src/components/RelationshipModal.jsx:16-23 | `<label>` containing an (i) button labels the button, not the field | confirmed |
| M4 | A11y | Medium | tailwind.config.js:7-24 · src/utils/constants.js:94-122 | Contrast failures: white on cyan 2.96:1, lines at 1.6–2.8:1, secondary text below 4.5:1 on tints | confirmed |
| M5 | A11y | Medium | src/components/ContextMenu.jsx:36-67 · Canvas | Context menu has no keyboard support; canvas cards can't be reached by keyboard | confirmed |
| M6 | Canvas | Medium | src/components/Canvas.jsx:252-260 | Horizontal scroll zooms in; trackpad two-finger scroll zooms instead of panning | confirmed |
| M7 | Undo | Medium | src/App.jsx:202-219 | Multi-delete is N commits/N undos; more than 50 selected makes the start state unrecoverable | confirmed (code) |
| M8 | Privacy | Medium | index.html:38 | Google GSI script fetched on every load even with Drive unconfigured | confirmed |
| M9 | Deps | Medium | package.json:13 | jspdf 2.5.2: 2 critical + 9 high advisories (low real exposure); dev-server advisories in vite/vitest | confirmed |
| M10 | CI | Medium | .github/workflows/deploy.yml:29-42 | Node 20 (EOL; jsdom 30 needs ≥22.22); tests never run before deploy | confirmed |
| M11 | Drive | Medium | src/utils/driveSync.js:97,107 · src/hooks/useDriveSync.js:204,314,404 | Upload doesn't request `modifiedTime`, so local clock is compared with Drive clock | suspected |
| M12 | Drive | Medium | src/hooks/useDriveSync.js:184-188,301-302 | Drive payload goes into state unvalidated (same brick risk as C2) | confirmed (code) |
| M13 | Render | Medium | src/components/PersonNode.jsx:127-141 | Long names overflow the card and overprint the lifespan; ellipsis never triggers | confirmed |
| M14 | Touch | Medium | src/components/Canvas.jsx:634-663 | iOS long-press fires no `contextmenu`, so the canvas has no Add Parent/Child/Sibling/Delete | suspected |
| L1 | Model | Low | src/utils/generations.js:220-226 | Step/adoptive/guardian link counted as the "second parent", so "half" is guessed | confirmed |
| L2 | Validation | Low | src/utils/validation.js:165-168 | Age-gap warnings applied to step/adoptive parents; 3rd+ parents ignored | confirmed |
| L3 | Dates | Low | src/utils/dates.js:8-9,36-61 | No future-year warning (birth 2999, living) | confirmed |
| L4 | Dates/Docs | Low | src/components/PersonModal.jsx:90-102 | Year inputs strip non-digits, so "c. 1890" or "1890s" can't be entered; README says "free text" | confirmed |
| L5 | Form | Low | src/components/PersonModal.jsx:264-275 | Hidden death year survives switching back to Alive and raises a warning about an invisible field | confirmed (code) |
| L6 | Undo | Low | src/hooks/useFamilyTree.js:137-145 | Saving an unchanged form still adds an undo step | confirmed (code) |
| L7 | Export | Low | src/utils/exportTree.js:69 | PDF embeds the image uncompressed (2.6 MB for one card) | confirmed |
| L8 | Export | Low | src/utils/exportTree.js:57-76 | Single A4 page; large trees become unreadably small | confirmed (code) |
| L9 | Canvas | Low | src/components/Canvas.jsx:24,240-250 | `MIN_SCALE` 0.3 means Fit can't show a 500-person tree (~50,000 px wide) | confirmed |
| L10 | Render | Low | src/components/RelationshipLines.jsx:157 · src/components/ErrorBoundary.jsx:31 | `'Inter'` is never loaded, so link labels render in serif and clip at 120 px | confirmed |
| L11 | Render | Low | src/components/Canvas.jsx:711-718 · src/components/RelationshipLines.jsx:17 | Paper rect hides the grid in a visible box; open-ring fill hard-coded to board colour on parchment | confirmed |
| L12 | Model | Low | src/utils/generations.js:64-68 · src/App.jsx:494 | Conflict toast/README say "pinned to row 0"; it isn't | confirmed |
| L13 | Robustness | Low | src/utils/validation.js:9 · src/App.jsx:154 | Name helpers print "Ann undefined" when `lastName` is missing (legacy or Drive data) | confirmed |
| L14 | Drive/UX | Low | src/App.jsx:87-107 | An arriving Drive conflict replaces whatever confirm dialog is open | confirmed (code) |
| L15 | A11y | Low | src/components/ToastStack.jsx:12-17 | Toasts lack a persistent live region; errors aren't `role="alert"` | confirmed (code) |
| L16 | Perf | Low | src/components/Canvas.jsx:524-612 | Drag handlers depend on `people`/`selectedIds`, so every card re-renders on every commit | confirmed (code) |
| L17 | Perf | Low | src/components/Canvas.jsx:709 | One Layer; a drag redraws ~2,900 shapes at 500 people | suspected |
| L18 | Build | Low | vite.config.js | 540 kB main chunk warning | confirmed |
| L19 | Hosting | Low | index.html | No favicon, so `/favicon.ico` 404s at the domain root | confirmed |
| L20 | CI | Low | .github/workflows/deploy.yml:9-17,40 | Over-broad permissions on build job, tag-pinned actions, `cancel-in-progress: true`, user-site repo gets wrong base | confirmed (code) |
| L21 | Drive | Low | src/hooks/useDriveSync.js:183-188 | Edits made while "Connecting…" can be replaced by a silent download with no undo | suspected |
| L22 | Model | Low | src/components/RelationshipModal.jsx:234-248 | Partner start/end years stored but never shown or checked (end < start) | confirmed (code) |
| N1–N10 | Quality | Nit | various | Dead Tailwind tokens, eslint comments with no ESLint, duplication, magic numbers, oversized files, etc. | confirmed |
| D1–D20 | Docs | — | README.md | Stale or false README statements (section 3.5) | confirmed |

---

## 3. Detailed findings

### 3.1 Critical

#### C1 — A bad or other-version save is silently replaced by an empty board
`src/utils/storage.js:52` (`parsed.version !== VERSION` returns `null`), `:58` (`catch` returns `null`), `src/App.jsx:138-148` (autosave effect runs on the first render)

**Repro (Playwright, preview build):**
1. `localStorage['family-tree/graph/v1'] = '{"version":1,"people":{"a":'` (truncated JSON), then reload. The app opens empty. Reading the key afterwards gives `{"version":1,"people":{},"relationships":{}}`, so the original blob is gone.
2. The same thing happens with `{"version":2, people:{a:{…firstName:"Kept"}}}`. The tree is erased.

**Why it matters:** the comment says the app "just opens empty, same as a first visit". In fact the mount-time autosave immediately writes that empty graph over the only copy. Any future `VERSION` bump, a half-written save, or a browser crash mid-write erases every user's tree with no warning. There is no toast because `loadRepairedCount` is only set on the success path.

**Fix:**
- Make `loadGraph` return a discriminated result: `{ status: 'ok' | 'empty' | 'unreadable' | 'unsupported-version', raw }`.
- When the status is unreadable or unsupported, copy `raw` to `family-tree/graph/v1/backup-<ISO>` before doing anything else.
- Keep a `suppressAutosaveUntilFirstEdit` flag, so the empty board isn't saved until the user actually commits something.
- Show a persistent toast: "We couldn't read your saved tree. A copy was kept — [Download it]."
- Add a `migrate(parsed)` step keyed on `version`, so future shape changes upgrade the data instead of discarding it.

#### C2 — One malformed person record bricks the app
`src/utils/storage.js:53` (`people` accepted as-is), `src/components/Canvas.jsx:211` (`person.position?.x` throws on `null`), `src/components/ErrorBoundary.jsx:69`

**Repro:** save `{"version":1,"people":{"a":null},"relationships":{}}`, then reload. The page shows "The board stopped responding". Clicking **Reload the page** shows the same screen again (`reloadRecovers: false`). The only way out is clearing site data, which the user has no button for. The ErrorBoundary text promises "nothing from before this happened is lost", but the only exit destroys it.

**Fix:**
- Add `sanitizeGraph(raw)` in `storage.js` and use it for both localStorage and Drive (see M12). It should:
  - drop entries that aren't objects;
  - set `id` from the key;
  - coerce `firstName`/`lastName`/… to strings;
  - default `position` to `{x: ORIGIN_X, y: rowY(0)}` when its values aren't finite numbers;
  - coerce `living` to a boolean;
  - then run `dropDanglingRelationships`.
- Report the number of repairs in the existing toast.
- Give ErrorBoundary two more buttons: **Download a backup of my data** (the raw localStorage blob as `.json`) and **Start with an empty board**. The second should rename the key to a backup, not delete it.
- Unit-test `sanitizeGraph` with `null`, strings, arrays and missing fields.

---

### 3.2 High

#### H1 — Large exports are silently empty; export quality depends on zoom
`src/utils/exportTree.js:9-24` (crop is in screen pixels after the view transform), `:38-40` (no result check)

**Repro:** load a 500-person tree (about 49,700 world px wide) and use the zoom buttons to reach 107%.
- **Export → Save PNG** downloads `family-tree.png` at **0 bytes**, and the toast says **"Saved as PNG."** The canvas would need about 106,000 px of width, which is past Chrome's 32,767 px per-side limit, so `toDataURL` returns `"data:,"`.
- The same tree at "Fit" (30%) exports at 29,836 × 1,106. On iOS Safari that exceeds the ~16.7 M-pixel canvas limit.
- A one-card tree exports at **876 × 744 at 100% zoom but 294 × 250 at 33%**. Output quality is whatever zoom the user happened to leave the board at.

**Fix:**
- Capture in world space independent of the view. Temporarily set stage scale 1 / position 0, or use `layer.toDataURL({ x, y, width, height, pixelRatio })` with a crop computed from `bounds`.
- Choose `pixelRatio = min(2, MAX_SIDE / worldW, MAX_SIDE / worldH, sqrt(MAX_AREA / (worldW*worldH)))`, with `MAX_SIDE = 16384` and `MAX_AREA = 16_777_216` to be safe on iOS. Restore the view afterwards.
- Use `toBlob` with `URL.createObjectURL` (and revoke it) instead of a data URL.
- Treat a null blob or a `"data:,"` result as an error, and show "This tree is too large for one image at full quality — exported at N%". Never show the success toast when this happens.

#### H2 — "Cards you drag are left exactly where you put them" is false
`src/utils/layout.js:144-194` (`resolveCollisions` uses `MIN_SLOT_GAP` = 201 px and treats two `placed` cards as equals), `src/hooks/useFamilyTree.js:165-179` (`movePerson` commits with `layout:false`, so nothing is resolved at drop time)

**Repro (probe):**
1. Card A is dragged to x=360 and card B to x=540. They are 180 px apart; cards are 158 px wide, so they don't touch.
2. Any later unrelated commit, such as renaming a third person, runs `autoLayout`.
3. B moves to **562**.

The user sees a card jump in response to an edit somewhere else on the board.

**Fix:**
- Resolve at the moment of the drop. Run the collision pass for that row with the dragged card at rank 0, so the user immediately sees where it lands.
- In `resolveCollisions`, never move a `placed` card because of another `placed` card. Placed-versus-placed should only be resolved by Tidy.
- Use visual overlap (`CARD_WIDTH + small margin`) instead of `SLOT_STEP − 1` whenever either card is hand-placed.
- Add a test: "two dragged cards 180 px apart survive an unrelated commit".

#### H3 — Cards can be dragged off their row and on top of other cards
`src/components/PersonNode.jsx:99-106` (no `dragBoundFunc`), `src/utils/layout.js:207-214` (keeps a placed card's `y`)

**Repro (probe):** card A is dragged to y=330, which is row 1's y, while A is generation 0. `autoLayout` leaves A at `{x:360, y:330}`, exactly on top of K. Collisions are checked per generation, not per y, so this is never detected.

The README says "drag moves a card left/right within its row" in two places.

**Fix:** add a `dragBoundFunc` that locks the absolute y to `rowY(placedGen) * scale + stage.y()`, or snap y to the row in `movePerson`/`moveMany`. Group drag (`moveMany`) needs the same y-lock for each member.

#### H4 — Links that contradict generations are accepted
`src/utils/validation.js:39-43` (a `parent` link only checks for duplicates and cycles), `:45-106`, `src/utils/generations.js:289-356` (`planSiblingMerge` only checks direct parent/partner pairs), `src/App.jsx:356` (partner-children batch is not validated)

**Repro (probe):**

| Action | Result |
|---|---|
| A and B are partners → add "A is parent of B" | `{ok:true}`; both get conflict badges |
| A and B are siblings → add "A is parent of B" | `{ok:true}` |
| Grandparent G and grandchild K → partner or sibling link | `{ok:true}`; conflicts `[K, C]` |
| D is C's child and B is C's sibling; link A–D as siblings, then A–B | Merge writes `D–B` (nephew and uncle as siblings) and `A–C`; conflicts `[C, D]` |

The README says these contradictions are "blocked before they're ever written".

**Fix:** add one general rule that replaces the piecemeal checks.
- Compute `computeGenerations(people, rels)` once.
- If `a` and `b` are already in the same connected component, the new link must satisfy its delta: parent means `gen(b) = gen(a) + 1`, partner and sibling mean `gen(a) = gen(b)`. Otherwise reject with something like "That would put Ann in two generations at once."
- Apply the same check to every implied pair in `planSiblingMerge` (skip and count it, as it already does for contradictions) and to the partner-children batch.
- Keep the specific friendly messages for the common cases.

#### H5 — Can't record an ex after the current partner; links can't be edited
`src/utils/validation.js:74-87`, `src/App.jsx:502-525` (clicking a link only offers "Remove this link"), `src/components/PersonModal.jsx:303-309` (links only offer "Unlink")

**Repro:** A–Y is "together". Adding A–X with status "divorced" fails with *"A is already partnered with Y — that link needs to end first."* (probe and browser). The exclusivity rule applies even though the new link has already ended. Recording a current spouse and then a previous marriage is the normal order of data entry.

In addition, "the first one is marked as ended" (README) can't be done. No UI edits a relationship's status or end year. The only route is to delete the link and re-create it, which also loses its start year.

**Fix:**
- Apply the "already partnered" check only when the new link is itself active (`!status || status === 'together' || status === 'separated'`).
- Add **Edit link…** to the link click menu and to the PersonModal link list. Reuse `RelationshipModal` in edit mode with kind fixed and status/type/years editable, plus an `updateRelationship(id, patch)` commit, and re-validate on save.

---

### 3.3 Medium

**M1 — Modal focus jumps to × whenever App re-renders.** `src/components/Modal.jsx:74` has the dependency list `[open, onClose]`. App passes inline arrows (`App.jsx:783, 802, 810`), so each App render tears down and re-runs the effect. That restores focus to the element outside the modal, then focuses the first focusable element.
- **Repro:** in the link dialog, focus "Link them" and press Enter so a validation error appears. Focus ends up on `BUTTON[Close] ×`.
- **Fix:** keep `onClose` in a ref, and give the effect the dependency list `[open]`.

**M2 — Stacked modals break keyboard use.** Each `Modal` adds its own window `keydown` trap. The duplicate-person `ConfirmDialog` opens on top of `PersonModal`, and the background trap pulls focus back.
- **Repro:** add "Solo" twice. Focus starts on a "Close ×" button, and four Tab presses never leave `BUTTON[Close]`. "Add anyway" can't be reached by keyboard.
- **Fix:** keep a module-level modal stack and let only the topmost modal handle Tab and Escape. Alternatively, set `inert` on lower dialogs or switch to native `<dialog>.showModal()`.

**M3 — Fields with an (i) hint have no accessible name.** `Label` renders the `InfoDot` `<button>` inside the `<label>`. The first labelable descendant (the button) takes the label, so the input gets none.
- **Repro:** in the browser, the "Additional names" input has `labels[0] = null`. The same happens to Status, Kind of parent and Kind of siblings. Clicking the label text also toggles the tooltip instead of focusing the field.
- **Fix:** render `InfoDot` outside the `<label>`, or use explicit `id`/`htmlFor` with the hint referenced through `aria-describedby`.

**M4 — Contrast (WCAG 2.2).** Measured values:

| Element | Ratio | Needed |
|---|---|---|
| White on `cyan` #0EA5B7: Add person, Link them, Save PNG, selected roster row | 2.96:1 | 4.5:1 |
| `mist` on `paper` | 4.28:1 | 4.5:1 |
| `mist` on `cyan-wash` | 4.01:1 | 4.5:1 |
| `mist/70` (Generation N labels) | 2.65:1 | 4.5:1 |
| `mist/60` placeholders | 2.25:1 | 4.5:1 |
| `white/80` on cyan | 2.40:1 | 4.5:1 |
| Deceased sub-text #7A9299 on #EEF3F4 | 2.93:1 | 4.5:1 |
| Line `parentSoft` #7FD3DD | 1.63:1 | 3:1 |
| Line `other` #A8BEC4 | 1.85:1 | 3:1 |
| Line `parent` #0EA5B7 | 2.82:1 | 3:1 |
| Deceased card stroke #C3D3D7 | 1.47:1 | 3:1 |

**Fix:**
- Use `cyan-deep` #0B6E7C as the fill for primary buttons and the selected row (5.94:1 with white). Keep bright cyan for accents only.
- Darken `mist` slightly, to about 4.6:1 or better on `#E4F5F7`.
- Drop the `/60` and `/70` opacity modifiers on text.
- Darken the three line colours to at least 3:1 against `#F6FAFB`, keeping their hue order.
- Re-check every pair with a small contrast script (I can add it under `scripts/`).

**M5 — Keyboard story.** None of the canvas is keyboard-reachable.
- `ContextMenu` uses `role="menu"` but doesn't move focus into itself. ArrowUp/ArrowDown do nothing (confirmed: focus stays on the ⋯ trigger), and focus isn't returned on close.
- The roster's ⋯ button is the only keyboard path to Add Parent/Child/Sibling, and it is hidden in the collapsed rail and the closed mobile drawer.
- **Fix:**
  - On open, focus the first item, support Up/Down/Home/End, close on Tab, and return focus to the opener.
  - Make roster rows a proper listbox with Enter = edit and Shift+F10 / ContextMenu key = menu.
  - Optionally, add an "Arrange: move left/right" keyboard command for the selected card.

**M6 — Wheel handling.** `Canvas.jsx:257` has `deltaY > 0 ? out : in`.
- A pure horizontal swipe (`deltaY = 0`) zooms in (confirmed: 100% → 109%).
- Every two-finger trackpad scroll zooms instead of panning, and the ctrl+wheel pinch uses a fixed 9% step per event, so it zooms far too fast.
- **Fix:**
  - When `evt.ctrlKey` is set (pinch) or a mouse wheel is detected, zoom by `Math.exp(-deltaY * 0.002)`.
  - Otherwise, pan by `(-deltaX, -deltaY)`.
  - Ignore events where both deltas are 0.

**M7 — Multi-delete produces N undo steps.** `App.jsx:214` calls `deletePerson` in a loop. Undoing a five-person delete takes five Ctrl+Z presses. Selecting more than 50 people (marquee) and deleting them pushes the pre-delete state out of the 50-entry history, so it can't be recovered. The confirm text also doesn't list the link count, which contradicts the README's "exactly what it affects".
- **Fix:** add `deleteMany(ids)` to the hook as a single commit, and include link and child counts in the message.

**M8 — Google contacted on every page load.** `index.html:38` loads `https://accounts.google.com/gsi/client` unconditionally (seen in the network log, with Drive unconfigured). This contradicts "nothing leaves your browser", and it is a third-party request for every visitor.
- **Fix:** remove the tag and inject the script from `useDriveSync` only when `isConfigured()` and the user signs in, or when a previous sign-in is flagged.

**M9 — Dependencies.** `npm audit` reports 7 vulnerabilities: 1 critical, 2 high, 4 moderate.
- **jspdf ≤ 4.2.0** (direct): critical GHSA-f8cm-6447-x5h2 (path traversal in the Node build) and GHSA-wfv2-pwc8-crg5 (HTML injection in new-window output), plus 9 high (PDF/JS injection through AcroForm/addJS/FreeText, and DoS from crafted images).
  - **Real exposure in this app is low:** it only calls `addImage` with its own PNG and `save()`, and never uses `output('dataurlnewwindow')`, AcroForm or addJS.
  - Upgrade to `jspdf@^4.2.1` anyway. Its transitive `dompurify` (12 advisories) and `canvg`/`html2canvas` chunks come along with it.
- **vite ≤ 6.4.2:** high GHSA-fx2h-pf6j-xcff (`server.fs.deny` bypass on Windows). Also esbuild, vitest/@vitest/mocker and nanoid (fixable with `npm audit fix`). All of these are dev-server/test-time only. They're relevant because development happens on Windows, but they don't affect the Pages bundle.
- **Outdated:** react 18 → 19, react-konva 18 → 19, konva 9 → 10, tailwind 3 → 4, vite 5 → 8. None are abandoned, so upgrade on your own schedule. The React 19 move must happen together with react-konva 19.
- **Lockfile:** consistent with `package.json`. `npm install` reports "up to date" and `npm ci --dry-run` is clean.

**M10 — CI.**
- `deploy.yml:29` pins `node-version: 20`. Node 20 reached EOL in April 2026, and `jsdom@30` declares `engines.node: ^22.22.2 || ^24.15.0 || >=26`, so tests would fail or warn on CI.
- No step runs `npm test`, so a broken layout algorithm deploys as long as it compiles.
- A failed *build* does block deploy (`needs: build`), which is correct.
- **Fix:** use `node-version: 22` (or `lts/*`), and add `- run: npm test` before Build.

**M11 — Drive sync compares two different clocks (suspected).** `uploadAppDataFile` (`driveSync.js:97,107`) doesn't pass `fields=`. Drive v3 `files.update`/`create` return only `kind,id,name,mimeType` by default, so `saved.modifiedTime` is `undefined`. `lastSyncedAt` then falls back to the *local* clock (`useDriveSync.js:204,314,404`). The next handshake compares it with Drive's server `modifiedTime`:
- If the device clock is behind, you get a spurious "Different tree on Google Drive" prompt.
- If the device clock is ahead, another device's newer save can be silently overwritten (`upload` instead of `ask`).
- **Confirm:** with a real client ID, log `saved` after one push.
- **Fix:** append `&fields=id,modifiedTime` to both upload URLs.

**M12 — Drive payload isn't validated.** `replaceGraph(payload)` (`useDriveSync.js:188,302`) passes Drive JSON straight into state, with no version check, no dangling-relationship repair and no type checks. A bad file on Drive causes the same crash loop as C2, on every device that signs in.
- **Fix:** route it through C2's `sanitizeGraph`, and write `version` into the Drive payload too.

**M13 — Long names break cards.** Konva's `ellipsis` only works when the `Text` has a `height`. Without one, the 84-character name in the screenshot wrapped to 109 px inside a 92 px card and printed over "b. 1950". Inputs have no `maxLength` either.
- **Fix:** set `height` to two lines (≈31 px) on the name `Text`, which turns ellipsis on. Add a `title`-like tooltip or show the full name in the sidebar, and set `maxLength` of about 80 on name inputs.

**M14 — No long-press on iOS (suspected).** The canvas menu relies on the DOM `contextmenu` event (`Canvas.jsx:634-663`). Android Chrome fires it on long-press; iOS Safari does not. On iPhone/iPad there is then no way from the board to Add Parent/Child/Sibling or Delete; the ⋯ in the drawer is the only path.
- **Confirm:** on an iOS device, long-press a card.
- **Fix:** start a 500 ms timer on `touchstart`, cancel it on move > 8 px or on `touchend`, and open the same menu at the touch point. Also suppress the drag that would otherwise start.

---

### 3.4 Low

**L1 — Half siblings inferred from a step parent.** `generations.js:220-226` counts *any* parent link as "a second parent on record". A shares birth parent M with B, and B's only other parent is a *step* parent, so the result is `half` (probe 6a). B's real second birth parent is still unknown, which is exactly the guess the README rule forbids. A shared parent who is *adoptive* for one side also yields `half` (probe 6c).
- **Fix:** count only birth/untyped links toward the second-parent rule, and treat a shared non-birth parent like the `shared ≥ 2` branch does.

**L2 — Age-gap warnings ignore the kind of parent.** `validation.js:165-168` feeds the first two parents of *any* type into biological age-gap warnings. A step-parent 5 years older than the stepchild raises "would only have been 5" (probe 11). A third parent is never checked.
- **Fix:** run the check only for birth/untyped parent links, over all of them.

**L3 — No warning for future years.** `MAX_YEAR = 2999`. Birth 2999 with living=true, or birth 2090 with death 2100, produce no warnings (probe 7b/7c).
- **Fix:** warn when a year is greater than `new Date().getFullYear()`.

**L4 — Approximate dates can't be entered.** `YearInput` strips non-digits and truncates to 4 characters. Pasting "1890-1950" becomes "1890", and "c. 1890" becomes "1890" with the "circa" lost. That's safe, but the README says dates are free text, and genealogy needs approximate dates. `dates.js` is never reached with pathological strings through the UI, only through hand-edited or Drive data (where it handles them correctly: `null` plus an "isn't a year we can read" warning, never a block).
- **Fix:** either update the docs (D11), or add an "approx." checkbox stored as `birthYearApprox: true` and rendered as "c. 1890".

**L5 — Hidden death year.** Choosing Deceased, typing a death year, then switching back to Alive hides the field but keeps the value. Saving then raises "Marked as living, but a year of death is filled in" for a field the user can't see.
- **Fix:** clear `deathYear` on save when `living`, or keep the field visible while it has a value.

**L6 — No-op commits create undo steps.** `updatePerson` always returns a new object, so "Save changes" with no edits costs an undo step. Konva also starts a drag at 0 px movement, so a slightly jittery click can commit a `movePerson`. That marks the card `placed` and adds a history entry.
- **Fix:** shallow-compare in `updatePerson`. Set `Konva.dragDistance = 3` and ignore drags under 2 px in `handleDragEnd`.

**L7 — Bloated PDFs.** `addImage(dataUrl, 'PNG', …)` without a compression argument stores raw RGB plus alpha. A one-card PDF was **2.6 MB**: 876 × 744 × 4 bytes.
- **Fix:** pass `'FAST'` as the compression argument, or flatten onto the background and use JPEG at quality 0.92.

**L8 — PDF is always a single A4 page.** A 50,000 px-wide tree scales to illegibility.
- **Fix:** use `format: [w, h]` in mm with a print-sensible DPI, or offer A3/A2 and tiling.

**L9 — Fit can't show big trees.** `MIN_SCALE = 0.3` is fixed. A 500-person tree is about 49,700 px wide, so at 30% Fit still overflows the screen by about 11×.
- **Fix:** set `min(0.3, fitScale)` as the floor, or compute the minimum zoom from bounds. Pan is also unbounded (the tree can be lost off-screen; Fit is the recovery), which is acceptable.

**L10 — Undeclared font.** `RelationshipLines.jsx:157` and `ErrorBoundary.jsx:31` use `'Inter'`, which is never loaded. The screenshot shows "other" labels in Times, clipped at the 120 px box.
- **Fix:** use the app font stack, and widen or measure the label.

**L11 — Visual artefacts.**
- The opaque paper `Rect` (`Canvas.jsx:711-718`) covers the CSS grid inside the content bounds, so a hard-edged rectangle with no grid is visible around the tree.
- On the parchment export, the engaged "ring-open" marker is filled `#F6FAFB` (hard-coded in `RelationshipLines.jsx:17`), which shows as an off-white disc (1.17:1).
- **Fix:** only draw the paper `Rect` during export, and fill the marker from `exportTheme?.background`.
- Line *colours* are template-independent as documented; this marker fill is the one deviation.

**L12 — Conflict copy is wrong.** The toast (`App.jsx:494`) and README say conflicted people are "pinned to row 0". `computeGenerations` keeps the first BFS assignment (probe 5: B stays at row 1).
- **Fix:** change the copy to "placed by the first link we found". Better still, name the contradicting link and offer "Remove it".

**L13 — Undefined name parts.** `displayName` (`validation.js:9`) and App's `nameOf` interpolate `undefined`. The browser error text was "Ann **undefined** is already partnered with Cy **undefined**" for a record without `lastName`. C2's sanitizer fixes the data side; also make a single `formatName(p)` that is null-safe.

**L14 — Drive conflict overrides open confirms.** `App.jsx:87-107` replaces `confirmState` when a conflict arrives, so a pending delete or duplicate question vanishes.
- **Fix:** queue confirmations, which is the same fix as M2's modal stack.

**L15 — Toasts aren't announced reliably.** Each toast is inserted with `role="status"`, but live regions only announce reliably when the region exists before its content changes. Errors should be assertive.
- **Fix:** render one always-present `<div aria-live="polite">` and one `aria-live="assertive"` container, and put toasts inside them.

**L16 — Card memoisation is defeated.** `handleDragStart` depends on `selectedIds` and `people`, `handleDragMove`/`handleDragEnd` depend on `findDropTarget`, and `findDropTarget` depends on `people`, `connectors` and `touchDrag`. So every commit, and the `touchDrag` flip at each drag start and end, re-renders every `PersonNode`. That defeats the memoisation described at length in `PersonNode.jsx:214-253`. Measured cost is tolerable: about 106 ms per add at 500 people.
- **Fix:** read `people`, `selectedIds` and `touchDrag` from refs inside these handlers so their identities stay stable.

**L17 — Whole-layer redraws during drag (suspected).** All roughly 2,900 shapes at 500 people live in one Layer, so every drag frame redraws everything. My scripted drag landed off-screen, so I have no reliable per-frame number.
- **Confirm:** run a Performance trace while dragging a visible card on the 500-person board.
- **Fix:** move dragged nodes to a dedicated drag layer on `dragstart`, and back on `dragend`.

**L18 — Chunk size.** `vite build` warns that `index-*.js` is 540.20 kB (169.59 kB gzip). It's mostly react-dom plus konva, all needed at boot. jsPDF, html2canvas and DOMPurify are already split lazily.
- **Fix:** `manualChunks: { konva: ['konva','react-konva'], react: ['react','react-dom'] }` for caching, or raise `chunkSizeWarningLimit`. Cosmetic.

**L19 — No favicon.** Browsers request `/favicon.ico` at the domain root, which 404s under Pages (observed).
- **Fix:** add `public/favicon.svg` and `<link rel="icon" href="%BASE_URL%favicon.svg">` (Vite rewrites it under `base`).

**L20 — Workflow hygiene.**
- `pages: write` and `id-token: write` are granted workflow-wide. Move them to the `deploy` job and leave the build job with `contents: read`.
- Actions are pinned to major tags, not SHAs. That's acceptable for a personal project; pin them if supply-chain risk matters to you.
- `cancel-in-progress: true` can cancel a deploy mid-publish. GitHub's starter workflow uses `false`.
- A user-site repo (`<user>.github.io`) would get `base=/<user>.github.io/`, which is wrong. Use `/` when `REPO_NAME == "${GITHUB_REPOSITORY_OWNER}.github.io"`.

**L21 — Edits during Drive connect can be lost (suspected).** The silent mount reauth can take up to 10 s. If the device started empty and the user adds people while the status reads "Connecting…", the handshake was decided on the mount-time snapshot. It then calls `replaceGraph(payload, {history:false})`, which overwrites those edits with no undo.
- **Confirm:** clear the board on a signed-in device, reload, add a person within a few seconds, and check whether it survives.
- **Fix:** re-read the current graph right before applying a `download`, and return `ask` if it's no longer empty.

**L22 — Partner years go nowhere.** `startDate` and `endDate` are collected but never displayed or validated (end < start, or end set while still together). Show them in the link list and run the date warnings on them.

**Nits**
- **N1** Unused Tailwind tokens: `colors.card`, `boxShadow.rail`, `borderRadius.xl2`, `fontFamily.body`, `fontFamily.mono` (`tailwind.config.js:8,35,38,29-30`).
- **N2** Three `eslint-disable` comments, but ESLint isn't installed or configured. Add `eslint` with `eslint-plugin-react-hooks`, which would also have caught L16, or remove the comments.
- **N3** Duplicated helpers:
  - name formatting in 5 places (`App.jsx:151`, `Canvas.jsx:40`, `RelationshipModal.jsx:95`, `Sidebar.jsx:5`, `validation.js:7`);
  - `YearInput`, `field` and `Label` in both modals;
  - `hasStorage` in `storage.js` and `useDriveSync.js`;
  - card colours in `PersonNode.jsx:13-14` repeating `EXPORT_THEMES[0].card`;
  - cluster ordering duplicated in `layoutRelativeRow` and `layoutReservedRow`.
- **N4** Magic numbers that belong in `constants.js`: `MIN_SCALE`, `MAX_SCALE`, `PAD`, wheel factor 1.09, button factor 1.2, `MARQUEE_THRESHOLD` (Canvas), and the PersonNode text metrics and `BAND_HEIGHT`.
- **N5** `App.jsx` (836 lines) holds every handler and the whole confirm orchestration. `Canvas.jsx` is 829 lines. Suggest a `useTreeActions` hook (link/adopt/delete/merge handlers returning confirm requests), a `useConfirmQueue`, and splitting Canvas gestures into `useViewport` and `useMarquee`. The prop lists (Canvas takes 18 props) reflect App doing too much, not a deep prop-drilling problem.
- **N6** Comments are often longer than the code and tell its history ("used to", "this change", "the earlier build"), which roughly doubles file length (`layout.js` is ~55% comments). Trim to *why* when touching each file.
- **N7** The `Fragment` wrapper in `RelationshipLines.jsx:150` is redundant, and `driveSync.js:115` re-exports `GOOGLE_DRIVE_SCOPE` for no reason.
- **N8** Parent types `guardian` and `ward` ("Legal guardian (their ward)") both mean "a is guardian of b". Merge them or explain the difference.
- **N9** `slugify` drops non-Latin names, so "Иванов" exports as `family-tree.png`. Use `name.normalize('NFKD')` and a Unicode-aware `\p{L}\p{N}` filter.
- **N10** Building locally in Git Bash with `VITE_BASE_PATH=/x/` is rewritten by MSYS path conversion to `/Program Files/Git/x/`, which I hit during this audit. CI is unaffected. Add a README note to use PowerShell or `MSYS_NO_PATHCONV=1`.

---

### 3.5 Docs vs reality (README.md)

| # | README (line) | Reality | Replacement text |
|---|---|---|---|
| D1 | Title "Family Tree Editor (v1)" (1) and "Deliberate v1 simplifications" (416) | Repo is V3, package is 1.0.0, and v1 scope has grown (Drive, templates, marquee) | "# Family Tree Editor" and "## Deliberate simplifications" |
| D2 | "A fun, single-session … open it, build a tree, export … close the tab." (3-7) | Autosaves to localStorage and reloads it | "A browser-based whiteboard for building a family tree. It autosaves in this browser and can optionally sync to your Google Drive; export a PNG or PDF to share it." |
| D3 | "nothing leaves your browser unless you export it or turn on … Drive sync" (4-6) | Every load fetches `accounts.google.com/gsi/client` (M8) | After M8 is fixed, true. Until then: "…apart from loading Google's sign-in script, which is fetched on every visit." |
| D4 | "index.css — Tailwind + the corkboard background texture" (102) | Faint cyan 32 px grid on off-white | "Tailwind layers, the board's faint grid, focus ring and toast animation" |
| D5 | "The corkboard texture is a fixed CSS background…" (430-431) | It's a grid | "The board's grid is a fixed CSS background rather than something that pans or zooms with the cards." |
| D6 | "an overlap of at least ~35% of the card area" (142-143) | `OVERLAP_THRESHOLD = 0.3` (30%); touch uses 22% | "an overlap of at least 30% of a card (22% on touch)" |
| D7 | "drag moves a card left/right within its row" (191-192) and "Manually dragging a card only ever moves it left/right within its own row" (209-210) | Free 2-D drag (H3) | After H3 is fixed, true. Otherwise: "drag moves a card anywhere; Tidy rows puts it back in its row." |
| D8 | "Cards you drag are left exactly where you put them." (21-22, 273-274) | They jump on the next edit when within 201 px of another card (H2) | After H2 is fixed, true. Otherwise add: "unless they end up closer than one slot to another card." |
| D9 | "affected people are … pinned to row 0" (218-220) | First BFS assignment wins (L12) | "affected people keep the row of the first link that placed them and get a warning badge." |
| D10 | "Self-marriage / self-parenting and circular parentage are blocked" and "two relationship kinds describe fundamentally different bonds" (366-385) | Partner→parent, sibling→parent and cross-generation partner/sibling links are not blocked (H4) | After H4: "Any link that would put someone in two generations at once is blocked, with the reason shown." |
| D11 | "Dates are treated as free text" (397) | Year fields accept digits only, max 4 (L4) | "Years only: the year fields accept digits and nothing else. Odd or inconsistent years (death before birth, a parent younger than 12 at the child's birth, 'living' with a death year, an age over 120) show as warnings and never block a save." |
| D12 | "Export … a canvas that isn't ready yet … surface a specific error toast instead of a silent failure" (401-404) | Oversized canvases fail silently with a success toast (H1) | After H1, add: "…and a tree too large for one image is exported at a reduced scale, with a toast saying so." |
| D13 | "a reload picks the tree right back up from the last autosave" (411-412) | Not when the saved data caused the crash (C2) | After C2: "…and if the saved data itself is the problem, the screen offers to download a backup and start fresh." |
| D14 | "Deleting … You'll always see exactly what it affects" (197-200) | Not for multi-select delete (M7) | After M7: true. Otherwise: "(for a single person)" |
| D15 | Export: sidebar "Export tree…" and memo "`Family tree of {name} — generated {date}`" (201-202) | Button reads "Export"; memo is `Family tree of {name} — {date}` (or `Family tree — {date}`) | "Export: sidebar **Export** → optional name → Look → PNG or PDF. The footer reads `Family tree of {name} — {date}`." |
| D16 | "right-click empty canvas -> 'Add person here'" (140-141) | Label is "Add a person here" | Use the exact label |
| D17 | "until the first one is marked as ended" (377-378) | No UI edits a link's status (H5) | After H5: "…until the first one is marked as ended (click the link → Edit link)." |
| D18 | Hosting: "set `base: '/'` in vite.config.js first if you're not serving it from a subpath" (59-60) | `base` already defaults to `/` when `VITE_BASE_PATH` is unset | "For any other static host, run `npm run build` and upload `dist/`. It's built for `/` unless you set `VITE_BASE_PATH`." |
| D19 | Running tests: "Vitest … unit tests …" (82-94) | Accurate, but CI never runs them (M10) | Add: "CI runs `npm test` before every deploy." (after M10) |
| D20 | Project structure (98-136) | Omits the `*.test.js` files and `useDriveSync.test.js` | Add a line: "`src/**/*.test.js` — Vitest unit tests (layout, generations, validation, history, Drive decision and hook)" |

The rest of the README checks out against the code:
- the visual-theme paragraph (cyan/white, rectangle = male, circle = female, ring/break/arch glyphs);
- the GitHub Pages steps;
- "Where a card lands" (slot lattice, outward search, centre tie-break);
- Tidy rows clustering;
- parent kinds, and sibling kinds apart from L1;
- the duplicate-person rule;
- add-child current-partner rule;
- the once-per-session save-failure toast (confirmed in the browser);
- the Drive setup and scope text;
- template-independent line colours (verified in code; the only deviation is L11's marker fill).

The README talks about photos nowhere, and **the app has no photo upload at all** (`grep` for `FileReader|createObjectURL|type="file"` finds nothing). The audit's photo questions (base64 storage, size limits, SVG, object-URL leaks) therefore don't apply.

---

## 4. What's genuinely well done (leave alone)

- **Pure core with real tests:** layout, generations, validation, history and Drive decision logic are pure modules with 97 passing, meaningful tests. The comparators are deliberately transitive and deterministic.
- **Undo/redo transition:** correct. `future` clears on every new commit, history is capped at 50, the Drive silent load bypasses history on purpose, and there are no stale-closure bugs in the reducer (all updates are functional).
- **No XSS surface:** user text goes only into React text nodes and Konva `Text`. A test name `<img src=x onerror=alert(1)>` and a link label `<script>` rendered inertly. The single `innerHTML` (`index.jsx:12`) is a static string.
- **Subpath deploy works:** assets, the lazy jsPDF chunk and the (commented) self-hosted font URLs all resolve under `/Family-Tree-V3/`. I checked this by serving `dist/` from a subfolder and by building a scratch copy with `public/fonts/` in place.
- **Lazy jsPDF:** keeps about 730 kB (jsPDF + html2canvas + DOMPurify + canvg) off the initial load.
- **Failure handling that works:** loading repairs dangling relationships, the storage-full toast fires once per session, the `crypto.randomUUID` fallback is in place, and so are ResizeObserver cleanup and the matchMedia fallback.
- **Destructive actions are confirmed:** confirm dialogs autofocus *Cancel*, and Clear board is undoable within the session.
- **Drive design:** narrowest scope (`drive.appdata`), never guesses on conflicts, and has a tested retry/backoff with a failed-resolution retry.
- **Performance:** turning off `perfectDrawEnabled` was the right call. 500 people load in about 1.6 s and tidy in about 0.46 s.

---

## 5. Phased fix plan

Each phase is one commit, ordered by value against the risk of the fix. After each phase: `npm run build && npm test`, plus a targeted browser check.

| Phase | Commit | Findings | Risk | Notes |
|---|---|---|---|---|
| 1 | **Persistence can't lose or brick data** | C1, C2, M12, L13 | Low | `sanitizeGraph` + discriminated `loadGraph` + backup key + autosave guard + ErrorBoundary "Download backup / Start fresh". New `storage.test.js`. |
| 2 | **CI runs tests on a supported Node** | M10, L20 | Very low | Node 22, `npm test` step, job-scoped permissions, user-site base. Protects every later phase. |
| 3 | **Export is correct at any size and zoom** | H1, L7 | Medium | Fixed-scale capture, canvas-limit clamp with honest toast, `toBlob`, PDF compression. Extract `computeExportScale()` as a pure function and test it. |
| 4 | **Generation-consistent validation** | H4, L1, L2, L12 copy | Medium | One generic delta check used by direct links, sibling merges and partner-children batches. Add tests for each probe case above. |
| 5 | **Partnership rules + edit a link** | H5, L22 | Medium | Exclusivity only for active new links; `updateRelationship` + RelationshipModal edit mode. |
| 6 | **Dragged cards really stay put** | H2, H3, L6 (drag part) | Medium | Row-locked `dragBoundFunc`, resolve on drop, placed-vs-placed never auto-moved, `dragDistance`. Add a layout test for the 180 px case. |
| 7 | **Modal focus & labelling** | M1, M2, M3, L14, L15 | Low–Med | `onClose` ref, modal stack, labels outside InfoDot, persistent live regions, confirm queue. |
| 8 | **Keyboard & touch access** | M5, M14 | Medium | Menu roving focus + focus return, roster keyboard model, long-press. |
| 9 | **Contrast & canvas polish** | M4, M13, L9, L10, L11 | Low | Token colour changes, name ellipsis + `maxLength`, dynamic min zoom, font stack, paper rect only during export. |
| 10 | **Wheel/trackpad & undo hygiene** | M6, M7, L5, L6 | Low | ctrl-pinch vs pan, `deleteMany` single commit, no-op detection, hidden death year. |
| 11 | **Drive correctness & privacy** | M8, M11, L21 | Medium | Load GSI on demand, request `fields=id,modifiedTime`, re-check emptiness before a silent download. Hard to test without a client ID; keep it isolated. |
| 12 | **Dependency upgrades** | M9, L18, L3 | Medium | `jspdf@4` (re-test PDF), `npm audit fix`, Vite/Vitest majors, `manualChunks`, future-year warning. |
| 13 | **README rewrite** | D1–D20, N10 | Very low | Apply the replacement text from 3.5, adjusted to whatever the earlier phases actually changed. |
| 14 | **Cleanup** | N1–N9, L16, L17 | Low | Dead tokens, ESLint + react-hooks plugin, shared `formatName`/`YearInput`, constants, ref-stable drag handlers, drag layer. |

### Tests that would pay off most (5–8 pure functions)

The suite already covers generations, layout, validation, history and the Drive decision logic. The highest-value additions:
1. `storage.loadGraph` / `sanitizeGraph`: corrupt JSON, wrong version, `null`/string/array people, missing fields; the backup is written and nothing is overwritten.
2. `validateRelationship` generation consistency: every probe case from H4, plus "ended partnership allowed alongside an active one" (H5).
3. `dates.getPersonDateWarnings` / `parseYear` / `formatLifespan`: empty, `" 1950 "`, numbers, future years, death < birth, living with a death year (no test file exists today).
4. `connectors.findConnectorAt`: exclusion of the dragged card's own lines, non-droppable kinds, tie-break by key.
5. `layout.resolveCollisions` via `autoLayout`: two placed cards 180 px apart survive an unrelated commit (H2).
6. `inferSiblingType`: a step or adoptive second parent must not produce `half` (L1).
7. `computeExportScale` (to be extracted in Phase 3): respects max side and area, and is independent of view zoom.
8. `collectTreeWarnings`: non-birth parents excluded, all birth parents considered (L2).

---

## Appendix — command output (verbatim, trimmed to the relevant lines)

`npm install` (Node v24.20.0, npm 11.19.0):
```
up to date, audited 242 packages in 4s
7 vulnerabilities (4 moderate, 2 high, 1 critical)
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   core-js@3.49.0 (postinstall: node -e "try{require('./postinstall')}catch(e){}")
npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
```
`npm run build`:
```
vite v5.4.21 building for production...
✓ 608 modules transformed.
dist/index.html                          1.86 kB │ gzip:   0.99 kB
dist/assets/index-DkTrEtNJ.css          22.24 kB │ gzip:   4.92 kB
dist/assets/purify.es-BwoZCkIS.js       22.03 kB │ gzip:   8.77 kB
dist/assets/index.es-DVzr8RwK.js       150.73 kB │ gzip:  51.57 kB
dist/assets/html2canvas.esm-CBrSDip1.js 201.42 kB │ gzip:  48.03 kB
dist/assets/jspdf.es.min-Cj-K3F2l.js    357.70 kB │ gzip: 118.01 kB
dist/assets/index-4sBAfGcG.js           540.20 kB │ gzip: 169.59 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 16.44s
```
`npm run preview` gave no warnings or errors (`➜  Local: http://localhost:4173/`).
Browser console on the subpath build: one error, `Failed to load resource: 404 @ http://127.0.0.1:8090/favicon.ico` (L19).

`npm test`:
```
✓ src/utils/generations.test.js (34 tests)
✓ src/utils/driveSync.test.js (9 tests)
✓ src/utils/history.test.js (4 tests)
✓ src/utils/validation.test.js (20 tests)
✓ src/utils/layout.test.js (25 tests)
✓ src/hooks/useDriveSync.test.js (5 tests)
Test Files  6 passed (6)
     Tests  97 passed (97)
```
Performance (headless Chromium, 1280×800, preview build, generated multi-generation family):

| People / links | Load to first paint | Tidy rows | Add-person commit |
|---|---|---|---|
| 150 / 236 | 437 ms | 196 ms | 38 ms |
| 500 / 812 | 1,563 ms | 456 ms | 106 ms |

---

## Found during fixes

New issues noticed while implementing the fixes. Logged here, and fixed only when a later round puts them in scope (noted per row).

| ID | Sev | Where | Issue | Suggested fix |
|---|---|---|---|---|
| F1 | Medium | `src/components/Modal.jsx:38-41` (refines M2) | With two dialogs stacked, Escape closes the dialog **underneath** and leaves the top one open. Reproduced: the duplicate-person prompt over the Add form (the form and its typed values are lost, the prompt stays). An "Edit link" dialog opened from the person form behaves the same way. The audit's M2 count of "2 → 1 dialogs" was this, not a correct close. | Fix with M2 in Phase 7: only the topmost dialog handles Escape/Tab. **Fixed in Phase 7.** |
| F2 | Low | `src/components/PersonModal.jsx` link list | Phase 5 adds "Edit link…" on a clicked line only. An Edit button in the person form's link list was built and then taken out, because of F1 (Escape there throws away unsaved person edits). Parent links aren't clickable on the board, so their type can't be edited yet. | Re-add the person-form Edit button once F1/M2 is fixed. When it's back, note that a "widowed" edit that marks *the person being edited* as deceased resets the open form (PersonModal re-initialises when `initialPerson` changes). **Fixed after Phase 7:** Edit button back; a child's drop from a parent line is clickable; the open form merges outside changes instead of resetting. |
| F3 | Low | `src/utils/generations.js:133-142` vs `src/utils/validation.js` comments | `activePartnersOf` treats a **separated** partnership as not current, so it doesn't block a new current partnership. The validation comments and README say separated counts as "unconcluded" and should block. The code and the docs disagree; decide which is intended. | Either count `separated` in `activePartnersOf` for the exclusivity check, or correct the comments and README (Phase 13). **Fixed:** code now matches the README; the exclusivity check counts separated (`activePartnersOf` itself is unchanged, since it answers a different question). |
| F4 | Low | `src/utils/connectors.js:93-119` | A partner line between two cards that aren't neighbours in a row is drawn straight through the cards in between, on top of their own partner lines. Clicking it can open the wrong link (seen: Ann–Xavi drawn through Yan, over Ann–Yan). The edit dialog names both people, so the wrong pick is visible, not silent. | Route non-adjacent partner lines as an arch, as sibling lines are drawn, or offset them vertically. **Fixed in Phase 9:** such a line becomes a bracket under the row, a step deeper per extra card skipped; a bracketed couple's children hang from the bracket. |
| F5 | Low | `src/utils/storage.js:49-52` | A loaded person with no `position` (hand-edited or Drive data) is put at the board origin, and nothing re-lays them out on load, so several such people stack exactly on one spot until something triggers a layout. Seen while seeding test data. | Treat a missing position as unplaced and run `autoLayout` once after `loadGraph`/Drive download. **Fixed:** `sanitizeGraph` (used by both loads) gives each one its own free slot on its row, near its positioned relatives, in id order; nobody with a saved position moves. |
| F6 | Low | `src/utils/constants.js` EXPORT_THEMES parchment | The parchment export template fails the same contrast checks M4 fixed on the board: white lifespan text on the memorial band #B79F78 is 2.55:1, and the living lifespan #8A7256 on #FBF6EA is 4.21:1 (4.5:1 needed). Exports only, so outside M4's scope. | Darken the band to about #7A6448 and the sub text to about #75603F, then add the parchment pairs to `contrast.test.js`. **Fixed:** band #87704E (white text 4.7:1), lifespan and memo #7A6449 (5.2:1 and 4.6:1; the memo was 3.70:1 too), unused deceased sub #735E44. Same hues, darkened only as far as needed; every export template is now checked. |
