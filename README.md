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
whatever links exist. New cards settle into the nearest free slot to
whoever they're related to, without moving anyone already on the board (see
"Where a card lands" below). Cards you drag are left exactly where you put
them.

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
    useFamilyTree.js        People/relationships state, undo/redo history, derived generations
    useToasts.js            Small notification queue for errors/warnings/success
    useMediaQuery.js        matchMedia wrapper for the drawer-vs-rail decision
    useDriveSync.js         Optional Google Drive sync: sign-in, conflict handshake, autosync
  components/
    Canvas.jsx              Konva stage: pan/zoom, drag-to-link, right-click menu
    PersonNode.jsx          One person's card (shape from gender, colour, dates, conflict badge)
    RelationshipLines.jsx   Every link drawn in the line language below
    Sidebar.jsx             Person list/search, add/export/undo/reset controls, legend, sync status
    Legend.jsx              The key: the same glyphs RelationshipLines draws
    PersonModal.jsx         Add/edit person form (warnings, delete)
    RelationshipModal.jsx   Confirm a link's kind/type/status after drag-drop or menu
    ExportModal.jsx         "Whose tree is this?" -> theme -> PNG/PDF export
    ContextMenu.jsx         Generic right-click menu (person, link, or empty canvas)
    ConfirmDialog.jsx       Generic yes/no confirmation (delete, clear board)
    Modal.jsx               Shared dialog shell: bottom sheet on phones, card on desktop
    Tooltip.jsx             Portal-rendered hover/focus tooltip, plus the (i) InfoDot
    ToastStack.jsx          Renders queued notifications
    ErrorBoundary.jsx       Catches render crashes with a friendly restart screen
  utils/
    constants.js            Genders, shapes, colours, relationship types, line styles, layout numbers
    id.js                   UUID generation with a manual fallback
    generations.js          BFS generation computation, cycle detection, sibling-type inference
    connectors.js           Line geometry shared by RelationshipLines and the drop hit-test
    layout.js               The slot lattice: findNearestFreeX, placeCard, autoLayout, reflowAll
    validation.js           Blocking rules + non-blocking warnings + duplicate detection
    dates.js                Forgiving date parsing for warning checks
    storage.js              Versioned localStorage autosave for this browser only
    driveConfig.js          The one file to edit: your own Google OAuth client ID
    driveSync.js            Drive REST calls, plus the pure sign-in reconciliation decision
    exportTree.js           Composites the memo footer, exports PNG/PDF
```

## How the key interactions work

- **Add a person**: sidebar "+ Add person" button, or right-click empty
  canvas -> "Add person here".
- **Link two people**: drag one person's card onto another's (an overlap of
  at least ~35% of the card area triggers a confirmation popup — the popup
  appears on drop, not mid-drag), or select exactly two people and
  right-click -> "Link to {name}…". Selecting a second person is
  shift-click on a mouse; on touch, since there's no shift key, a second
  tap adds to the selection on its own — tapping two different people in a
  row is enough. Either way the same dialog opens — "How are they
  related?" — and nothing is written until it's confirmed.
- **Adopt a card as a child by dropping it onto a line**: drag any card onto
  a parent-child line or a couple's line and let go — the line lights up
  while you are over it. This does not spawn a new person: the card you
  dragged is who the new child is. It snaps straight back to where it was
  (dropping is a question, not a move), and a confirmation dialog names the
  parents and the person before anything is written — the same "nothing
  commits until you say so" rule the card-on-card drop above follows.
  Landing on a card is checked first, so a drop that overlaps someone still
  means "link these two people". A card is never counted as landing on a
  line it is already an end of, and sibling arches and "something else"
  links are not drop targets — neither says anything about parentage. If
  the drop would make someone their own ancestor, or the two are already
  linked that way, it's refused with a plain-language reason instead.
  On a touch drag specifically, both of the drop gestures above get a wider
  hit zone than a mouse drag does, and a banner across the top of the board
  says in words what's currently under the card — a finger sits right on
  top of the highlight that would otherwise show it, so the highlight alone
  isn't enough to confirm a hit the way it is with a cursor.
- **Add Parent / Child / Sibling**: right-click a person's card.
  - *Add Parent* adds one new parent above them and opens it for editing —
    no second parent required. A relationship link never needs two people
    to exist; add a partner for that new parent afterwards if there is one.
  - *Add Child* adds a new child below them. If they have exactly one
    *current* partner (status "together", or no status set — an ex is
    never assumed), the child is linked to both parents at once; otherwise
    just to this one.
  - *Add Sibling* works whether or not the person has listed parents yet —
    with none on record it becomes a plain sibling link; the "kind of
    sibling" field only pre-fills once there's enough on the board to
    infer it, and can always be overridden.
  - Each of these guards against the mistakes described below rather than
    silently doing nothing.
- **Select / edit / move**: single click selects, double click edits,
  shift-click (or, on touch, a second tap) multi-selects, drag moves a card
  left/right within its row.
- **Undo / redo**: sidebar buttons, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or
  Ctrl+Y). Selection changes alone aren't tracked, so undo always reverts an
  actual structural change. Adopting a dragged card into one or two parents
  is one undo step, not one per parent.
- **Delete**: right-click -> Delete, the Delete/Backspace key with someone
  selected, or the delete link inside the edit form. You'll always see
  exactly what it affects (relationships removed, children who'll lose that
  parent link) before confirming.
- **Export**: sidebar "Export tree…" -> name prompt -> PNG or PDF. The name
  is stamped as a memo footer: `Family tree of {name} — generated {date}`.

## Generations (computed, not typed in)

Row position (the Y axis) is always derived by walking the parent/relationship
graph — a person's generation is one below their parent's generation,
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

## Where a card lands (X position)

Every automatically-placed card sits on one lattice of slots,
`ORIGIN_X + n * SLOT_STEP`, and exactly one function decides which slot a
card gets: `findNearestFreeX` in `layout.js`. Adding a person uses it, and
so does the collision resolver, so there is only ever one answer to "where
does this card go".

A card first works out where it would *like* to be — the midpoint of both
its parents, directly above its child, beside its sibling, the spot you
right-clicked, or the centre line if it has nothing to go on. From that
slot the lattice is searched **outward**, and a tie at equal distance goes
to whichever candidate is **nearer the centre line**. That last rule is
what keeps the board from leaning: a row that has already spread one way
gets filled back in from the inside rather than extended further out. On a
dead heat (only possible for a card that wants the centre slot itself) the
emptier half of the row wins, so repeated additions alternate sides —
`0, -1, +1, -2, +2`.

Adding a card **never moves anyone already on the board**. The earlier
build tried three fixed positions beside the anchor, claimed the right-hand
one whether or not it was free, and left a left-to-right packing sweep to
shove the current occupant along — and since a sweep only ever pushes
right, every crowded insertion nudged the whole board a little further
right, permanently. It also shoved cards you had positioned by hand.

Rows can still collide for reasons that have nothing to do with insertion:
someone changed generation under them, or a tree saved by an older build is
being opened. Those are resolved by moving the **lower-priority** card to
its own nearest free slot. Priority decides who keeps their exact X: the
card just added (it already searched for a genuinely free slot), then any
card dragged by hand (you put it there on purpose), then everyone else.
Within a rank the comparison is done on a rounded X so that two cards a
fraction of a pixel apart still count as competing for the same slot — but
rounding, rather than a tolerance window, because a window isn't transitive
(0.0 ties 0.4, 0.4 ties 0.8, yet 0.0 is clearly left of 0.8) and an
intransitive comparator lets the sort return a different answer depending
on which element it happens to pivot on. Ties fall back to id, so the same
tree always lays out the same way.

Cards moved by hand are never snapped onto the lattice — they are treated
as obstacles instead, since you put them exactly where you wanted them.
**Tidy rows** is the one exception, and the only thing that moves cards
nobody touched: it keeps each row's left-to-right order, closes the gaps
onto the lattice, and re-centres every row on the centre line. It is also
how a tree saved by an older build gets onto the lattice, since a loaded
graph is otherwise left alone until something in it actually collides. A
row with an even number of cards ends up half a slot off the centre line;
keeping every card on a whole slot is worth more than centring it exactly.

## Kinds of parents

Six parent types are recorded on a parent link: birth, adoptive, step,
foster, guardian, and ward (a legal-guardian link, drawn the same direction
as any other parent link — the guardian is `a`, their ward is `b`). Only
birth draws as a solid line; every other type draws the same softer dashed
line and carries the same generic "Non-birth parent" label in the key,
rather than naming a subset — a fixed list of names here is exactly what
went stale the last time a parent type was added, so the line style and the
label both key off "is this birth?" instead.

## Kinds of siblings

Full, half, step and adopted are recorded on the sibling link. The dialog
asks it in two steps: "Fully biological" or "Other" first, and only when
"Other" is picked does it show which — half, step, or adopted. The form
fills the detailed choice in for you from the parents already on the
board: two shared parents (both by birth) reads as full; two shared
parents where at least one link isn't a birth link (adoptive, step,
foster, guardian) reads as adopted; one shared parent reads as half; no
shared parent whose parents are partners reads as step. The reasoning is
shown under the field, and the choice can always be overridden.

Where the recorded parentage is too thin to tell, nothing is guessed. Two
people sharing one parent are only offered "half" once both of them have a
second parent on record — otherwise the second parent may simply not have
been entered yet, and they could just as easily be full siblings. Quietly
labelling that "half" would be inventing a fact about someone's family.

Only "full" siblings draw as the plain sibling arch; half, step and
adopted all share a second, muted-colour version of the same arch — same
dash pattern, so it still reads as "a sibling link" at a glance, just not
the default case.

**A new sibling link merges the two people's whole sibling groups, not
just the one pair.** If B already has a recorded sibling C, and someone
links A to B as siblings, A and C become siblings too — siblinghood is
transitive, so leaving that implied link undrawn would just mean the
board understates what's already true. This runs as one commit (one undo
for the whole merge), and each newly-implied pair gets its OWN type
inferred fresh from its own recorded parentage — never copied from
whatever type the original A-B pair was given, since two people's actual
shared parentage doesn't change because someone elsewhere in the group got
called "half". A pair that would contradict itself (already recorded as
parent/child, or as partners) is left out of the merge rather than forced
into a second, contradictory relationship, and the toast says how many
pairs that affected, if any.

## Error handling this build takes into account

- **Self-marriage / self-parenting** and **circular parentage** are blocked
  before they're ever written to state, with a specific, human-readable
  reason shown as a toast.
- **Duplicate active partnerships** between the same two people are blocked
  — but only while the existing one hasn't ended. A divorced or widowed
  partnership doesn't block a new one between that same pair: that's a
  remarriage, a new chapter in their history, not a duplicate of the old
  record, and both stay on the board side by side.
- **A second active partnership is blocked too**, even with someone else
  entirely: a person already in an unconcluded relationship (together or
  separated — nothing has ended) can't also become partners with a third
  person until the first one is marked as ended. Concluded relationships
  (divorced, widowed) don't count, for the same remarriage reason above.
- **Partners and siblings are mutually exclusive.** Two people already
  recorded as partners can't also become siblings, and two people already
  recorded as siblings can't also become partners — in either direction,
  and (for the sibling side) regardless of whether the partnership has
  since ended, since that's a different kind of contradiction than the
  remarriage case: the two relationship kinds describe fundamentally
  different bonds, not different chapters of the same one.
- **Duplicate people** are caught before they land: saving someone whose
  name, gender and year of birth all match a card already on the board
  raises "You already added this person" and asks before continuing. It's
  a question, not a block — two relatives really can share a name — and
  the form stays open behind it so the details can be corrected instead of
  retyped. A different year of birth is never treated as a duplicate,
  since a grandparent and grandchild sharing a name is ordinary.
- **Deleting a person** shows exactly what will be affected first
  (relationships removed, children who'll lose that parent link) rather
  than a generic "are you sure?". Deleting never leaves a dangling
  reference to a person or relationship that no longer exists.
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

- "Add Child" attaches to a person's one *current* partner (status
  "together", or no status recorded) if there's exactly one — an ex is
  never assumed onto a new child. With more than one current partner, or
  none, the child is linked to just this parent; there's no picker yet for
  choosing among several.
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

## Google Drive sync (optional)

An optional sign-in that saves the tree to the user's own Google Drive —
an alternative to guest/local-only mode, not a replacement for it. Guest
mode keeps working exactly as before whether or not this is ever set up;
the localStorage copy stays as a fast local cache even when signed in.

### Setting it up

Drive sync is switched off out of the box: `src/utils/driveConfig.js` ships
with a placeholder client ID, and the app hides every sign-in control until
that's replaced. To turn it on:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   a project (or use an existing one), then **APIs & Services -> Library**
   and enable the **Google Drive API**.
2. **APIs & Services -> OAuth consent screen**: set it up for **External**
   users (or **Internal** if this is for a Google Workspace org only). It
   can stay in "Testing" status for personal use — that just limits sign-in
   to email addresses you explicitly add as test users, which is fine for
   sharing a tree with family.
3. **APIs & Services -> Credentials -> Create Credentials -> OAuth client
   ID**, application type **Web application**. Add your GitHub Pages URL
   (`https://<you>.github.io`) under **Authorized JavaScript origins** —
   not "Authorized redirect URIs", which this flow doesn't use.
4. Copy the client ID (ends in `.apps.googleusercontent.com`) into
   `GOOGLE_CLIENT_ID` in `src/utils/driveConfig.js`. It is not a secret —
   this flow never uses a client secret at all, so committing it is normal
   and safe, the same as any other OAuth client ID shipped in a browser app.

No server, no database, and no credentials of ours are involved anywhere in
this — everything above happens in Google's own console, under the user's
own Google account.

### What it actually does

Signing in asks for the narrow `drive.appdata` scope: a folder that, per
Google's own scope documentation, is invisible in the user's normal Drive
UI and inaccessible to any other app — nothing broader is ever requested.
One JSON file lives there, holding the same `people`/`relationships` shape
as the local save, plus a `savedAt` timestamp.

**Sign-in is a real Google consent screen** the first time, and a silent,
popup-free reauth on every later visit — this is a static page with no
server, so there is no refresh token to hold the way a backend-based app
would; a browser blocking third-party storage, or the user revoking access
from their Google account, makes the silent attempt fail, and the only
fallback is showing the "Sign in" button again rather than anything
failing loudly.

**Reconciling what's on Drive against what's on this device** happens once,
right after sign-in, and always resolves one of four ways:
- Drive is empty, this device has a tree -> pushed up, silently.
- This device is empty, Drive has a tree -> pulled down, silently.
- Both are empty, or Drive hasn't changed since this device last synced ->
  nothing to do (or a routine push of ongoing edits).
- Anything else — most commonly, another device saved something since
  this one last synced, or this is the first time this particular device
  has ever seen this Drive file while already holding a tree of its own —
  is handed to the person as an explicit choice: keep this device's tree,
  or load Drive's. **Whichever isn't picked gets overwritten** — Undo
  reaches back through that choice immediately after (and re-syncs the
  reverted state, since an undo is just another change), but only until
  the tab is closed or reloaded.

Once signed in, every structural change pushes to Drive automatically,
debounced by a couple of seconds so rapid edits don't turn into a Drive API
call per keystroke.

### What this doesn't cover

Real-time collaboration — two people editing the same tree from two
devices at the same moment. The reconciliation above runs once at sign-in,
not continuously, so two devices both signed in and both being edited at
once will each keep pushing over the other rather than merging; the
conflict prompt only catches a mismatch that already existed *before* the
current editing session started.

## Export templates

The "Look" picker in the export dialog is presentation only: it changes
the colours and typeface of the exported PNG/PDF, never the underlying
data, and never the editable board itself — that always renders exactly
as it does day to day. Relationship-line colours don't change between
templates even so, since those carry meaning (divorced vs. widowed vs.
step) that a paper-and-ink choice shouldn't override.
