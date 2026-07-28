# Family Tree Editor (v1)

A fun, single-session, browser-based whiteboard for building a family tree with
friends. No accounts, no backend, nothing saved. Open it, build a tree, export
a picture or PDF, close the tab.

Visual theme: a soft off-white board in cyan and white. Cards are shaped by
gender — a rectangle for male, a circle for female — and a small vocabulary of
connector styles carries the relationship: a filled ring for marriage, an open
ring for engagement, a double-slash break for divorce, a plain grey line for
widowed, a dotted arch for siblings, and a rounded drop for parent and child.
The sidebar carries a key showing the same glyphs.

Relationships are deliberately unconstrained: siblings don't need a parent on
the board, children don't need a couple, and any two people can be linked
without setting anything else up first. Generation rows are computed from
whatever links exist. New cards are placed beside whoever they're related to,
on whichever side has room, and existing cards shuffle right to make space.
Cards you drag are left exactly where you put them.

## Typeface

The whole app is set in Proxima Nova, which is a commercial licence — it is
not on Google Fonts and will not load until you supply it. See the comment at
the top of `index.html` for the two ways to do that (Adobe Fonts, or a
purchased webfont self-hosted from `public/fonts/`). Until then the browser
falls back to the system UI font and everything else works normally.

## Hosting it on GitHub Pages

This is a static, client-only app (no backend, exactly per spec), so GitHub
Pages can host it directly. A ready-to-go workflow is already included at
`.github/workflows/deploy.yml`.

1. Create a new repo on GitHub and push this project to its `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo-name>.git
   git push -u origin main
   ```
2. In the repo, go to **Settings -> Pages** and set **Source** to
   **GitHub Actions**.
3. That's it — the push already kicked off the workflow (check the
   **Actions** tab). Once it finishes, the app is live at
   `https://<you>.github.io/<repo-name>/`.

The workflow figures out the repo name automatically, so nothing in
`vite.config.js` needs to be hand-edited. Every future push to `main`
redeploys automatically.

If you'd rather deploy manually to any other static host (Netlify, Vercel,
a plain S3 bucket, etc.), just run `npm run build` and upload the `dist/`
folder — set `base: '/'` in `vite.config.js` first if you're not serving it
from a subpath.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

`src/index.jsx` is the entry point — that's the file to start reading if you
want to see how everything is wired together, and it's what `index.html`
loads directly.

To build a static production bundle:

```bash
npm run build
npm run preview   # serve the built files locally to double check
```

## Project structure

```
index.html                 Vite HTML shell — loads src/index.jsx
src/
  index.jsx                Entry point: mounts <App /> inside an ErrorBoundary
  index.css                Tailwind + the corkboard background texture
  App.jsx                  Wires state, modals, context menus, and shortcuts together
  hooks/
    useFamilyTree.js        People/unions state, undo/redo history, derived generations
    useToasts.js            Small notification queue for errors/warnings/success
  components/
    Canvas.jsx              Konva stage: pan/zoom, drag-to-connect, right-click menu
    PersonNode.jsx          One person's pinned card (shape/color/photo/dates)
    ConnectionLines.jsx      The red "string" between partners and down to children
    Sidebar.jsx             Person list/search, add/export/undo/reset controls
    PersonModal.jsx         Add/edit person form (photo upload, warnings, delete)
    UnionModal.jsx          Confirm a union's type/status after drag-drop or menu
    ExportModal.jsx         "Whose tree is this?" -> PNG/PDF export
    ContextMenu.jsx         Generic right-click menu (person or empty canvas)
    ConfirmDialog.jsx       Generic yes/no confirmation (delete, clear board)
    ToastStack.jsx          Renders queued notifications
    ErrorBoundary.jsx       Catches render crashes with a friendly restart screen
  utils/
    constants.js            Genders, shapes, colors, union types, layout numbers
    id.js                   UUID generation with a manual fallback
    generations.js          BFS generation computation + cycle detection
    validation.js           Blocking rules + non-blocking warnings
    dates.js                Forgiving date parsing for warning checks
    exportTree.js           Composites the memo footer, exports PNG/PDF
    useHtmlImage.js         Loads an uploaded photo for Konva rendering
```

## How the key interactions work

- **Add a person**: sidebar "+ Add person" button, or right-click empty
  canvas -> "Add person here".
- **Form a union**: drag one person's card onto another's (an overlap of at
  least ~35% of the card area triggers a confirmation popup — the popup
  appears on drop, not mid-drag), or shift-click to select exactly two
  people and right-click -> "Marriage / Partnership…".
- **Add Parent / Child / Sibling**: right-click a person's card.
  - *Add Parent* creates two new linked parent cards at once (since a union
    always needs two people) and immediately opens one for editing.
  - *Add Child* needs the person to already be in a union first.
  - *Add Sibling* needs the person to already have listed parents.
  - Each of these guards against the mistakes described below rather than
    silently doing nothing.
- **Select / edit / move**: single click selects, double click edits,
  shift-click multi-selects, drag moves a card left/right within its row.
- **Undo / redo**: sidebar buttons, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or
  Ctrl+Y). Selection changes alone aren't tracked, so undo always reverts an
  actual structural change.
- **Delete**: right-click -> Delete, the Delete/Backspace key with someone
  selected, or the delete link inside the edit form. You'll always see
  exactly what it affects (unions removed, children who'll lose that parent
  link) before confirming.
- **Export**: sidebar "Export tree…" -> name prompt -> PNG or PDF. The name
  is stamped as a memo footer: `Family tree of {name} — generated {date}`.

## Generations (computed, not typed in)

Row position (the Y axis) is always derived by walking the parent/union
graph — a person's generation is one below their parent union's generation,
and it's recomputed from scratch after every change, so it can never get out
of sync. Manually dragging a card only ever moves it left/right within its
own row.

Two edge cases are handled explicitly rather than left to crash:
- A person with no listed ancestry who marries into a family with real
  ancestry inherits their partner's generation, instead of defaulting to
  the top row.
- Circular parentage (someone becoming their own ancestor) is blocked at
  the moment you'd try to create it. If a bug ever let one through anyway,
  affected people are flagged with a small warning badge and pinned to row
  0 instead of freezing the app in an infinite loop. Click the badge and
  it explains what's contradictory, in plain language, as a toast.

Within a row, cards are packed left to right so none of them overlap. The
comparison is done on a rounded X so that two cards a fraction of a pixel
apart still count as competing for the same slot — but rounding, rather
than a tolerance window, because a window isn't transitive (0.0 ties 0.4,
0.4 ties 0.8, yet 0.0 is clearly left of 0.8) and an intransitive
comparator lets the sort return a different answer depending on which
element it happens to pivot on. Ties fall back to the incoming card, then
to id, so the same tree always lays out the same way.

## Kinds of siblings

Full, half and step are recorded on the sibling link, but the form fills
them in for you from the parents already on the board: two shared parents
reads as full, one shared parent reads as half, and no shared parent whose
parents are partners reads as step. The reasoning is shown under the field,
and the choice can always be overridden.

Where the recorded parentage is too thin to tell, nothing is guessed. Two
people sharing one parent are only offered "half" once both of them have a
second parent on record — otherwise the second parent may simply not have
been entered yet, and they could just as easily be full siblings. Quietly
labelling that "half" would be inventing a fact about someone's family.

## Error handling this build takes into account

- **Self-marriage / self-parenting** and **circular parentage** are blocked
  before they're ever written to state, with a specific, human-readable
  reason shown as a toast.
- **Duplicate active unions** between the same two people are blocked
  (remarriage after a divorce/widowhood is still allowed — that's a new
  union, not a duplicate).
- **Duplicate people** are caught before they land: saving someone whose
  name, gender and year of birth all match a card already on the board
  raises "You already added this person" and asks before continuing. It's
  a question, not a block — two relatives really can share a name — and
  the form stays open behind it so the details can be corrected instead of
  retyped. A different year of birth is never treated as a duplicate,
  since a grandparent and grandchild sharing a name is ordinary.
- **Deleting a person** shows exactly what will be affected first (unions
  removed, children who'll lose that parent link) rather than a generic
  "are you sure?". Deleting never leaves a dangling reference to a person
  or union that no longer exists.
- **Dates** are treated as free text and never block a save — implausible
  or inconsistent dates (death before birth, a parent younger than their
  child, marked "living" with a death date, etc.) show as inline warnings
  instead.
- **Export** is wrapped in try/catch end-to-end: a failed PDF library load,
  a canvas that isn't ready yet, or a browser without 2D canvas support all
  surface a specific error toast instead of a silent failure or a frozen
  "Exporting…" button.
- **Window resizing** is handled with a `ResizeObserver` so the canvas
  always matches its container instead of clipping or leaving stale
  whitespace.
- **Zoom** is clamped to a sane range so the board can't be scaled away to
  nothing or flipped.
- A top-level **error boundary** catches any unexpected render crash and
  offers a clean restart instead of a blank white screen — reasonable here
  since nothing is saved between sessions anyway.
- Old browsers without `crypto.randomUUID` fall back to a manual id
  generator so the app still works rather than throwing on startup.

## Deliberate v1 simplifications

Matching the trimmed-down spec, these are intentionally out of scope:
accounts/auth/collaboration, GEDCOM/CSV/XML import, and any export beyond
PNG/PDF. A few smaller simplifications worth knowing about:

- "Add Child" attaches to the person's active (`together`) union if they
  have one, otherwise their first listed union — there's no picker yet for
  choosing between multiple past marriages.
- The corkboard texture is a fixed CSS background rather than something
  that pans/zooms with the board itself.

## Saving (local only, no account)

The tree autosaves to this browser's `localStorage` after every structural
change, and reloads automatically the next time the page opens. There's no
account and nothing leaves the browser — this is "survives a refresh,"
not "backed up anywhere." Clearing the board, or clearing this browser's
site data, erases it. Export is still the only way to get a copy that
outlives this browser: hand a file to someone else, keep it after clearing
your browser data, or view it on another device.

If `localStorage` is unavailable or full, saving fails quietly rather than
interrupting anything — a single toast warns once per session so it isn't
repeated on every edit.

## Export templates

The "Look" picker in the export dialog is presentation only: it changes
the colours and typeface of the exported PNG/PDF, never the underlying
data, and never the editable board itself — that always renders exactly
as it does day to day. Relationship-line colours don't change between
templates even so, since those carry meaning (divorced vs. widowed vs.
step) that a paper-and-ink choice shouldn't override.
