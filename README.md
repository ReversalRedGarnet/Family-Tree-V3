# Family Tree Editor

A browser-based whiteboard for building a family tree. It autosaves in this
browser and can optionally sync to your own Google Drive; export a PNG or PDF
to share it. There is no account to create and no backend of this app's own.

Your tree stays in your browser unless you export it or turn on the optional
Google Drive sync. Nothing is requested from Google until you click a Drive
sign-in button, and with Drive sync not set up (as shipped) the app never
contacts Google at all. See [Google Drive sync](#google-drive-sync-optional)
below.

## What you see

A soft off-white board with a faint grid, in cyan and white. Each person is a
card, shaped by gender (a rectangle for male, a circle for female) and
outlined in a colour you pick. A card shows the name (up to two lines, then
"…"; hover the name in the people list to see it in full) and "b. 1950" for
someone living.
Someone who has died gets a grey card with a band along the bottom:
"† 1921 – 1990".

Lines carry the relationship, and the sidebar's **What the lines mean** key
draws the same glyphs:

| Line | Meaning |
|---|---|
| Solid, filled ring in the middle | Married |
| Solid, dot in the middle | Partners |
| Dashed, open ring | Engaged |
| Grey dashed | Separated |
| Grey dashed with a double slash | Divorced |
| Plain grey | Widowed |
| Solid line from the parents down to each child | Birth parent |
| Lighter dashed version of the same | Any other kind of parent (adoptive, step, foster, guardian) |
| Dotted arch over the cards | Full siblings; a darker arch is half, step or adopted siblings |
| Faint dotted line, with your own label | Something else (godparent, friend…) |

Partners usually sit side by side. When other cards sit between two partners
(an ex placed beyond a current partner, say), their line drops under the row
as a bracket instead of running behind those cards, and each extra card it
skips takes it a little deeper.

The colour palette is checked by a test: text colours have at least 4.5:1
contrast on the surfaces they're used on, and every line colour at least 3:1
against the board, in the app and in both export templates.

## Running it

You need Node 22.12 or newer.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

`src/index.jsx` is the entry point (`index.html` loads it). To build and
check a production bundle:

```bash
npm run build
npm run preview   # serves dist/ locally
```

React and Konva are built into chunks of their own; jsPDF and its helpers
load only when someone exports a PDF.

## Running tests

```bash
npm test
```

Vitest, configured in `vite.config.js`. Most tests are plain unit tests of
the logic in `src/utils/` (layout, generations, validation, history, storage
and recovery, connectors, dates, export scaling, zoom and wheel handling,
colour contrast) and of the hooks (`useFamilyTree`, `useDriveSync`,
`useConfirmQueue`). A few render components in jsdom to check dialog
stacking, focus, labels and the error screen.

## Hosting it on GitHub Pages

This is a static, client-only app, so GitHub Pages can host it directly with
the included workflow, `.github/workflows/deploy.yml`.

1. Push this project to the `main` branch of a GitHub repo.
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. The push already started the workflow (see the **Actions** tab). When it
   finishes, the app is live at `https://<you>.github.io/<repo-name>/`.

What the workflow does:
- On every pull request into `main`, and every push to `main`, it installs
  dependencies, runs ESLint (`npm run lint`), runs the tests, then builds. A
  lint error or a failing test stops it.
- Only a push to `main` deploys. A pull request never publishes anything.
- It works out the base path from the repo name, so nothing needs editing: a
  project site is built for `/<repo-name>/`, and a user or organisation site
  (a repo named `<owner>.github.io`) for `/`.

For any other static host, run `npm run build` and upload `dist/`. It's built
for `/` unless you set `VITE_BASE_PATH`.

On Windows, set `VITE_BASE_PATH` from PowerShell rather than Git Bash: Git
Bash rewrites a value like `/x/` into a Windows path.

## Typeface

The app is set in Proxima Nova, a commercial typeface. It is not on Google
Fonts and won't load until you supply it. The comment at the top of
`index.html` explains the two ways: Adobe Fonts, or a purchased webfont
self-hosted from `public/fonts/`. Until then the browser uses the system UI
font, and everything else works normally.

## Project structure

```
index.html                 Vite HTML shell: loads src/index.jsx
src/
  index.jsx                Entry point: mounts <App /> inside an ErrorBoundary
  index.css                Tailwind layers, the board's grid, focus ring, toast animation
  App.jsx                  Wires state, dialogs, menus and shortcuts together
  hooks/
    useFamilyTree.js        People/relationships state, undo/redo, derived generations
    useConfirmQueue.js      Yes/no questions shown one at a time
    useToasts.js            Notification queue
    useMediaQuery.js        matchMedia wrapper (drawer on phones, rail on desktop)
    useDriveSync.js         Optional Google Drive sync: sign-in, reconciliation, autosync
  components/
    Canvas.jsx              Konva board: pan/zoom, drag to move or link, selection box
    PersonNode.jsx          One person's card
    RelationshipLines.jsx   Every line, drawn from connectors.js geometry
    Sidebar.jsx             Controls, people list, line key, warnings, sync status
    Legend.jsx              The line key
    PersonModal.jsx         Add/edit a person; their links (Edit, Unlink); Delete
    RelationshipModal.jsx   Create or edit one link
    FormFields.jsx          Field style, label and year input shared by both dialogs
    ExportModal.jsx         Name, Look, PNG/PDF
    ContextMenu.jsx         The menus: right-click, long-press, or a click on empty board
    ConfirmDialog.jsx       Yes/no question
    Modal.jsx               Shared dialog shell; only the top dialog takes keys
    Tooltip.jsx             Hover/focus tooltip and the (i) hint button
    ToastStack.jsx          Notifications, in screen-reader live regions
    ErrorBoundary.jsx       Recovery screen if rendering crashes
  utils/
    constants.js            Genders, colours, relationship types, line styles, layout numbers, export templates
    generations.js          Generation rows, cycle checks, sibling-type inference, sibling merges
    validation.js           What's blocked, what's only a warning, duplicate detection
    layout.js               Card placement, collision handling, Tidy the layout
    connectors.js           Line geometry, shared by drawing and drop detection
    viewport.js             Zoom limits and wheel/trackpad handling
    boardNav.js             Moving around the board with the keyboard
    boardPointer.js         What a click or drag on empty board does (pan, select, menu)
    longPress.js            Long-press detection for touch screens
    history.js              Undo/redo stack (50 steps)
    storage.js              localStorage save, load checks, backups of unreadable saves
    dates.js                Year parsing and date warnings
    names.js                Display names
    id.js                   Ids (crypto.randomUUID with a fallback)
    exportTree.js           PNG/PDF export
    driveConfig.js          Your Google OAuth client ID (the one file to edit for Drive)
    driveSync.js            Drive REST calls and the sign-in reconciliation decision
  **/*.test.js              Vitest tests
```

## Using it

### Adding people

- Sidebar **Add person**, or the **Add the first person** button on an empty
  board. The new card goes in the middle of what you're looking at.
- Click empty board (with nobody selected) → **Add person here**, or
  right-click empty board → **Add a person here**.
- Right-click a card (or use **⋯** next to them in the people list):
  - **Add a parent** adds one parent above them. No second parent is needed.
  - **Add a child** adds a child below them. If they have exactly one current
    partner (status "together", or no status), the child is linked to both;
    otherwise just to this person. Separated, divorced and widowed partners
    are never assumed.
  - **Add a sibling** links the newcomer to the same parents if any are on
    record, otherwise as a plain sibling, and joins them to the person's
    whole sibling group.

Only first name, last name, gender and living status are asked for up front;
everything else is optional. Names are capped at 80 characters. Saving
someone whose name, gender and year of birth match a person already on the
board asks before adding them; the form stays open behind the question.

Years are digits only, like `1953`. The fields accept nothing else, so
"c. 1890" or "1890s" can't be entered; an approximate year can go in Notes.

### Linking people

- Drag one card onto another and let go. An overlap of at least 30% of a card
  counts (22% when dragging by touch). A dialog asks how they're related, and
  nothing is saved until you confirm.
- Or select two people (click, then Shift-click; on touch, tap one then the
  other) and use **Link two people**. With one person selected, right-click
  someone else → **Link to {name}…**.
- **Adopt a card as a child:** drag a card onto a parent line or a couple's
  line and let go; the line lights up while you're over it. A confirmation
  names the parents and the child before anything is saved. Landing on a card
  takes priority over landing on a line. Sibling arches and "something else"
  links aren't drop targets, and nobody can be dropped onto a line they're
  already part of. On touch, the drop zones are wider, and a banner at the
  top says what's under the card.

### Editing and removing links

- Click a line → **Edit link…** or **Remove this link**. For a parent line,
  click the part that drops to a particular child; the menu offers each of
  that child's parent links by name. The trunk shared by several children
  isn't clickable.
- Or open a person (double-click their card) and use **Edit** or **Unlink**
  in their list of links.

Editing changes a link's details (type, status, years, or label), not who it
connects.

### Moving cards

Cards stay in their generation row and move left or right only. While you
drag, a card follows the pointer anywhere, so you can reach another card or a
line to link with. A plain drop keeps the new left/right position and puts
the card back on its own row. If it would land on top of another card, only
the dropped card is nudged to the nearest clear spot beside it.

Cards you drag stay exactly where you put them. Nothing that happens later
(adding people, new links, other collisions) moves them, except **Tidy the
layout**, or a new link that changes their generation.

- With several people selected, dragging one of them moves them all sideways
  together.
- A tiny wobble while clicking doesn't count as a move.
- **Selecting several people:** hold Shift and drag on empty board to draw a
  selection box. Without a Shift key (on a touch screen, say), click or tap
  empty board → **Select multiple**, then drag a box round them; it's
  one-shot, and Esc cancels it. **Select multiple** is in every board and
  person menu too. While anyone is selected, a note at the top of the board
  says how many, and that Esc or a click on empty board clears them.

### Pan and zoom

- **Pan:** drag on empty board to move around, or use two-finger scroll on a
  trackpad (up/down and sideways), the middle mouse button, Space + drag, or
  one finger on empty board on a touch screen.
  Space + drag works whatever has focus, except a text field or drop-down. If
  a button has focus, pressing Space on its own still presses it; a Space +
  drag pan doesn't.
- **Arrow keys** pan the board too (Shift + arrow pans further) while nobody
  is selected and the board, or nothing, has focus. With someone selected
  they move between people instead (see below).
- **Zoom:** the mouse wheel, a trackpad pinch, a two-finger pinch on touch,
  or the − / + buttons. One mouse-wheel notch is about 10%.
- **Fit everyone on screen** (⤢). Zooming out stops at 30%, or further out
  if that's what it takes to fit the whole tree, however wide. The most you
  can zoom in is 240%.

### Undo and redo

Sidebar buttons, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y). Up to 50
steps, kept until you close or reload the tab.

- Selecting people isn't a step.
- Saving a form without changing anything isn't a step.
- Deleting several people, adopting a card into one or two parents, and
  merging two sibling groups are each a single step.
- Undo, redo and Delete don't act while a dialog is open.

### Deleting

Right-click → **Delete**, the Delete or Backspace key with people selected, or
**Delete** in the person form. The question says how many links will go and
how many children stay on the board without that parent, for one person or
several.

### Keyboard and dialogs

- **Escape** closes only the dialog on top. With a question open over a form,
  the form and what you've typed in it stay. With a menu open, Escape closes
  just the menu; with **Select multiple** waiting for its drag, it cancels just
  that; with nothing open, it clears the selection.
- **Tab** stays inside the top dialog.
- When a dialog closes, focus goes back to whatever opened it.
- Fields that have an (i) hint are labelled for screen readers, with the hint
  read as their description.
- Notifications are announced by screen readers; errors interrupt.
- If a second yes/no question arrives while one is open (for example, a Drive
  conflict during a delete), it waits its turn instead of replacing the first.

**The board from the keyboard.** The board is a single Tab stop. While it has
keyboard focus, a dashed ring marks the current person, and screen readers
read out their name, years, and whether they're selected.

- **Arrow keys**, while someone is selected or the ring is on someone, move
  between people: left and right along a row, up and down to the nearest
  person in the row above or below. **Home** and **End** go to the ends of
  the row. The board pans to keep the person on screen. With nobody selected
  and no ring, the arrows pan the board instead. **Escape** clears the
  selection and hides the ring, so the arrows go back to panning; click a
  card, or Tab away and back, to move between people again.
- Moving selects the person you land on. **Shift** with an arrow adds them to
  the selection instead, so you can pick two people to link.
- **Space** selects or deselects the current person. (After a mouse click on
  the board, holding Space still pans.)
- **Enter** opens the current person for editing.
- **Shift+F10** or the **Menu** key opens their menu, the same one a
  right-click opens. On an empty board it offers **Add a person here** and
  **Select multiple**.
- **Delete** and **Backspace** delete the selection, as above.

**Menus.** A menu opened from the keyboard starts on its first item; one opened
by a click, tap, right-click or long-press takes focus without highlighting
anything. **Up**
and **Down** move between items (wrapping round), **Home** and **End** jump to
the first and last, **Enter** or **Space** picks one, and **Escape** or **Tab**
closes the menu. Focus goes back to where it was, including after a dialog
that the item opened.

**Touch.** A tap on empty board works like a click: with nobody selected it
opens **Add person here** / **Select multiple**, otherwise it clears the
selection. Holding a finger still on a card or on the empty board for half a
second opens the same menu a right-click does. Moving the finger first (to
drag or pan), or putting down a second finger (to pinch), cancels it.

### Exporting

Sidebar **Export** → an optional name → **Look** → **Save PNG** or **Save
PDF**. The footer reads `Family tree of {name} — {date}`, or
`Family tree — {date}` without a name.

- **The whole tree is exported, whatever you're zoomed to**, at twice the
  board's size for sharpness.
- **Large trees:** if that would make an image bigger than the browser can
  draw, it's exported at the largest size that fits, and a message says so
  ("…saved at 32% resolution"), rather than producing an empty file.
- **PDF:** one A4 page, landscape or portrait to match the tree, with the
  image compressed.
- **Look** is presentation only:
  - **Board** matches the screen;
  - **Parchment keepsake** uses warm paper tones and a serif font.

  Line colours never change between looks, because they carry meaning.

## Generations (computed, not typed in)

Each person's row comes from the links: a child is one row below a parent, and
partners and siblings share a row. "Something else" links impose nothing. Rows
are recomputed after every change. Each separate family group starts at the
top row, and someone with no parents on the board who partners into a family
takes their partner's row.

A link that would put someone in two generations at once is refused, with the
reason. For example, someone can't become the parent of their own sibling, or
the partner of their grandchild. If contradictory links get in anyway (from an
older save, say), each person keeps the row from the first link that placed
them, gets a warning badge (**!**), and clicking the badge explains.

## Where a card lands

Automatically placed cards sit on evenly spaced slots. A new card first works
out where it would like to be:
- under the middle of its parents;
- directly above its child;
- beside its sibling;
- the spot you right-clicked;
- or the middle of your current view.

It takes the nearest free slot to that point. A tie goes to the slot nearer
the board's centre line, so the board doesn't drift to one side as it grows.
Adding someone never moves anyone already on the board.

Cards can still end up overlapping, for example after someone changes
generation. Then the card that was placed automatically moves to its nearest
free slot. A card you dragged by hand is never moved this way.

If a saved tree (from this browser, Google Drive, or a hand-edited file) has
people with no position, each of them gets a free slot on their own row, near
whichever relatives already have one. They're placed in a fixed order, so the
same file always opens the same way. People who had a position keep it.

### Tidy the layout

The sidebar's **Tidy the layout** re-flows the whole board, and is the only
thing that moves hand-placed cards. It groups each row into families by who
their recorded parents are; a partner with no parents on the board joins
their partner's family. It then works out the layout like this:
- The row with the most people sets the spacing. It's laid out first, evenly
  spaced.
- Rows below it are centred under their own parents. Each family branch gets
  as much room as its descendants need, so a crowded branch pushes its
  neighbours aside instead of being pulled off-centre.
- Rows above are centred over their own children.

It's one undo step, and does nothing if the board is already tidy.

## Partnerships

- A person can have only one **current** partnership: together, separated, or
  no status. A separated partnership still counts, because separation isn't
  a divorce. To add a new current partner, first mark the old link as divorced
  or widowed: click it, then **Edit link…**. The error message says so.
- **Ended** partnerships (divorced, widowed) can be recorded at any time,
  alongside a current one, with anyone, including an earlier marriage to the
  same person. A remarriage is a new record, not a duplicate.
- Choosing **widowed** asks who has died (unless the board already says) and
  marks that person as no longer living.
- Start and end years are optional. The person form's link list shows them,
  and an end before the start shows up as a warning.

## Kinds of parents

A parent link is a birth, adoptive, step, foster, guardian or ward
(legal guardian) link. Only birth links draw solid; the rest share the
lighter dashed line and one "Non-birth parent" entry in the key. Only birth
parents count for the parent/child age warnings.

## Kinds of siblings

Full, half, step or adopted. The link dialog suggests one from the parents
already on the board, explains why, and lets you override it:
- **Full:** both people share two parents, all of them birth links.
- **Adopted:** they share parents, but at least one of those links isn't a
  birth link.
- **Half:** they share one birth parent, and both have a different second
  birth parent on record. While either second birth parent is missing,
  nothing is suggested, because they might be full siblings.
- **Step:** no shared parent, but their parents are partners.

A new sibling link merges the two people's whole sibling groups. If B
already has a sibling C and you link A to B, A and C become siblings too. Each
new pair gets its own type from its own parents. Pairs that would contradict
something (already parent and child, or partners) are left out, and the
confirmation message says how many were skipped. The merge is one undo step.

## What's blocked, and what's only a warning

Blocked, with a plain-language reason:
- linking someone to themselves;
- making someone their own ancestor;
- the same link twice;
- partners or siblings who are already parent and child;
- partners who are already siblings, and siblings who are already partners;
- a second current partnership;
- a link that contradicts generations.

Only warnings: these never block a save, and appear under **Worth a look**
in the sidebar:
- death before birth;
- a year in the future;
- "living" with a year of death;
- an age over 120;
- a birth parent born after the child, under 12 at the birth, or over 75
  years older;
- a partnership that ends before it starts.

When the person form is set to Alive, any year of death is cleared on save, so
the "living with a year of death" warning only comes from data saved
elsewhere or by an older version.

## Saving and recovery

The tree autosaves to this browser's `localStorage` after every change, and
reloads when you come back. Nothing leaves the browser this way, and it's not
a backup: clearing the board or this site's data erases it. Export to keep a
copy that outlives this browser.

- **A save can't be read, or was written by a different version of the
  app.** The board starts empty, and the original save is never overwritten.
  It's copied to a backup in this browser first, and a message offers
  **Download it**. If even that copy can't be made (storage full), autosave
  stays paused until you download it.
- **A save is readable but has broken records** (a person who isn't an
  object, a link to someone missing). Those are skipped, and a message says
  so. The rest loads.
- **Storage is unavailable or full.** One message per session says the tree
  can't autosave; nothing else is interrupted.
- **Something on the board crashes.** A recovery screen replaces the blank
  page, with **Reload the page**. In case the saved tree itself is the cause,
  it also offers **Download a backup of my data** and **Start with an empty
  board (the old tree is kept aside)**.

## Google Drive sync (optional)

An optional sign-in that also saves the tree to your own Google Drive. The
browser copy is still saved either way.

### What loads from Google

- **Only when you click a Drive sign-in or reconnect button:** Google's
  sign-in script, from `accounts.google.com/gsi/client`. Opening the page
  loads nothing from Google, and while Drive sync isn't set up nothing ever
  does.
- **Only after you sign in:** the tree itself is uploaded to and downloaded
  from your Drive.

### Setting it up

Drive sync is off until you add your own OAuth client ID. While
`src/utils/driveConfig.js` has its placeholder, the app shows no sign-in
controls.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or reuse one), then **APIs & Services → Library**, and enable the
   **Google Drive API**.
2. **APIs & Services → OAuth consent screen**: choose **External** (or
   **Internal** for a Google Workspace org). It can stay in "Testing" for
   personal use, which limits sign-in to the test users you add.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**. Add your site's origin (for example
   `https://<you>.github.io`) under **Authorized JavaScript origins**.
4. Put the client ID (ending `.apps.googleusercontent.com`) in
   `GOOGLE_CLIENT_ID` in `src/utils/driveConfig.js`. It isn't a secret; this
   flow never uses a client secret.

### What it does

- **Scope.** It asks only for the `drive.appdata` scope: a hidden folder in
  your Drive that you can't see in Drive itself and other apps can't read. One
  file lives there, holding the tree plus a save version and time.
- **Sign-in.** The first sign-in shows Google's consent screen. On later
  visits sync doesn't resume by itself: the sidebar shows **Reconnect to
  Google Drive**, and one click signs in again without the consent screen.
  If that fails (third-party storage blocked, or access revoked), the
  **Sign in** button comes back.
- **The first check.** Right after signing in, the app compares Drive with
  this device:
  - Drive empty, this device has a tree: it's uploaded.
  - This device empty, Drive has a tree: it's downloaded.
  - Drive hasn't changed since this device last synced: this device's tree
    is uploaded.
  - Otherwise (another device saved since, or this device has never synced
    with that file): you choose **Use Drive's version** or **Keep this
    device**. The other side is overwritten. Undo can take it back right
    after, but not once you reload.
- **Downloads are checked.** A downloaded tree goes through the same checks
  as a local save: a file from a different app version is refused, and
  broken records are skipped.
- **Ongoing saves.** After that, every change is uploaded about 2.5 seconds
  after you stop editing. A failed upload is retried a few times with
  growing delays before an error is shown.

### What it doesn't do

- **No real-time collaboration.** The comparison happens once, at sign-in.
  Two devices editing at the same time will each overwrite the other's
  uploads; nothing is merged.
- **It doesn't rely on this device's clock.** Whether Drive has changed
  since this device last synced is judged by Drive's own save times, so a
  device whose clock is wrong can't misjudge it.

## Deliberate simplifications

- No GEDCOM, CSV or XML import, and no export besides PNG and PDF.
- A PDF is always a single A4 page, so a very large tree prints small.
- Years only, as digits. No months, days or approximate dates.
- **Add a child** links to the one current partner if there is exactly one.
  There's no picker for choosing among several.
- The board's grid is a fixed CSS background rather than something that
  pans or zooms with the cards.
- No photos.
