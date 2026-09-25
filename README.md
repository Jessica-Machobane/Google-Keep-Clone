# Keep Clone — a simplified Google Keep

A Google Keep clone built with **plain HTML, CSS and JavaScript** — no
frameworks, no build step, no dependencies.

## How to run

**Option 1 — just open it**
Double-click `index.html` (or drag it into any modern browser). Everything
works from the local file.

**Option 2 — serve it statically (recommended)**

```bash
# from this folder, pick one:
npx serve .
python3 -m http.server 8080
```

Then visit the printed address, e.g. `http://localhost:8080`.

> Notes are stored in your browser's `localStorage`, so they survive page
> reloads. Clearing site data resets the app.

## Features

- **Create & edit notes** via the "Take a note…" bar or by clicking any note
  (modal editor with title, text and colour picker)
- **Display** notes in a responsive masonry grid (or single-column list)
- **Pin** notes — pinned notes appear in a separate "Pinned" section
- **Colour** notes with the 11-colour Google Keep palette
- **Archive / unarchive** notes (Archive view in the sidebar)
- **Delete** notes to the **Bin**, then restore or delete forever
- **Search** across titles and note text
- **Dark theme** with the "Dark theme is here" banner (Got it / Turn it on)
- **Toasts** with an Undo button, hover **tooltips** on every icon button
- Everything persists in `localStorage`

## Project structure

```
├── index.html   # page structure and semantics
├── style.css    # theme tokens (light + dark), layout, components
├── script.js    # state, rendering, CRUD, search, UI interactions
└── README.md
```

## Code organisation (script.js)

1. Constants, helpers and demo data
2. State (`notes` array, current view, search term)
3. DOM references
4. Filtering + rendering (view → visible notes → cards)
5. Note operations (pin, colour, archive, bin — all with Undo)
6. Toast notifications
7. Modal editor (create/edit)
8. Colour popover
9. Global delegated events
10. Top bar: menu, refresh, layout toggle, theme, banner
11. First paint
