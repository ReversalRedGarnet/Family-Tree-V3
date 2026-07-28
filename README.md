# Family Tree Editor (v3)

A fun, single-session, browser-based whiteboard for building a family tree with
friends. No accounts, no backend, nothing saved. Open it, build a tree, export
a picture or PDF, close the tab.

## Hosting it on GitHub Pages

This is a static, client-only app (no backend, exactly per spec), so GitHub
Pages can host it directly. A ready-to-go workflow is already included at
`.github/workflows/deploy.yml`.


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
