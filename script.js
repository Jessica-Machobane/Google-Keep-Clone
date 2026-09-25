"use strict";

/* =====================================================================
   Keep Clone — script.js
   A simplified Google Keep: create, edit, pin, colour, archive and
   delete notes. All state lives in the `notes` array and is persisted
   to localStorage after every change.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. Constants, tiny helpers and demo data
   --------------------------------------------------------------------- */
const STORAGE_KEY = "keepClone.notes.v1";
const THEME_KEY   = "keepClone.theme";
const BANNER_KEY  = "keepClone.bannerDismissed";

const PALETTE = [
  { id: "default",  label: "Default",  value: ""        },
  { id: "coral",    label: "Coral",    value: "#f28b82" },
  { id: "sun",      label: "Sun",      value: "#fdd663" },
  { id: "lime",     label: "Lime",     value: "#ccff90" },
  { id: "teal",     label: "Teal",     value: "#a7ffeb" },
  { id: "sky",      label: "Sky",      value: "#cbf0f8" },
  { id: "lavender", label: "Lavender", value: "#aecbfa" },
  { id: "lilac",    label: "Lilac",    value: "#d7aefc" },
  { id: "blush",    label: "Blush",    value: "#fdcfe8" },
  { id: "sand",     label: "Sand",     value: "#e6c9a8" },
  { id: "gray",     label: "Gray",     value: "#e8eaed" },
];

const EMPTY_MESSAGES = {
  notes:     "Notes you add appear here",
  reminders: "Notes with reminders appear here",
  archive:   "Your archived notes appear here",
  bin:       "No notes in Bin",
};

const EMPTY_ICONS = { notes: "lightbulb", reminders: "notifications", archive: "archive", bin: "delete" };

const $ = (selector) => document.querySelector(selector);

/** Escape user text before inserting it into HTML templates. */
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "\x26amp;", "<": "\x26lt;", ">": "\x26gt;", '"': "\x26quot;", "'": "\x26#39;" }[ch]
  ));

/** Markup for one colour swatch (used in the modal and the popover). */
const swatchHTML = (selectedId) => PALETTE.map((c) => `
  <button type="button"
          class="swatch${c.id === selectedId ? " selected" : ""}"
          data-color-id="${c.id}"
          data-tooltip="${c.label}"
          style="--swatch:${c.value || "var(--surface-hover)"}"
          aria-label="${c.label}"></button>`).join("");

/* ---------------------------------------------------------------------
   2. State
   --------------------------------------------------------------------- */
let notes = loadNotes();     // full note list (persisted)
let view = "notes";          // notes | reminders | archive | bin
let searchTerm = "";         // search filter text
let editingId = null;        // note currently open in the modal (null = new)
let currentColor = "default";// colour selected in the modal
let modalIntent = "save";    // what the modal should do when it closes
let undoSnapshot = null;     // serialized notes, for the toast Undo button
let paletteTargetId = null;  // note whose colour popover is open

/** Load notes from localStorage; seed two demo notes on first run. */
function loadNotes() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(stored)) return stored;
  } catch { /* corrupted data — fall through to the demo notes */ }
  return [
    { id: 1, title: "Welcome to Keep", text: "Click a note to edit it.\n\nHover a note to pin it, change its colour, archive or delete it.", color: "sun", pinned: true,  archived: false, trashed: false },
    { id: 2, title: "Groceries",       text: "Oat milk\nRye bread\nBlueberries",                                 color: "sky", pinned: false, archived: false, trashed: false },
  ];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

const getNote = (id) => notes.find((n) => n.id === id);

/* ---------------------------------------------------------------------
   3. DOM references
   --------------------------------------------------------------------- */
const els = {
  searchInput:  $("#search-input"),
  emptyState:   $("#empty-state"),
  emptyIcon:    $("#empty-icon"),
  emptyText:    $("#empty-text"),
  pinnedLabel:  $("#pinned-label"),
  pinnedGrid:   $("#pinned-grid"),
  othersLabel:  $("#others-label"),
  othersGrid:   $("#others-grid"),
  creator:      $("#note-creator"),
  banner:       $("#banner"),
  palettePop:   $("#palette-pop"),
  dialog:       $("#note-modal"),
  modalCard:    $("#modal-card"),
  modalTitle:   $("#modal-title"),
  modalText:    $("#modal-text"),
  modalColors:  $("#modal-colors"),
  modalPalette: $("#modal-palette"),
  modalArchive: $("#modal-archive"),
  modalDelete:  $("#modal-delete"),
  toast:        $("#toast"),
  toastMessage: $("#toast-message"),
  toastUndo:    $("#toast-undo"),
};

/* ---------------------------------------------------------------------
   4. Filtering + rendering
   --------------------------------------------------------------------- */

/** Notes that should show in the current view, matching the search. */
function visibleNotes() {
  const term = searchTerm.trim().toLowerCase();
  return notes.filter((note) => {
    if (view === "notes"   && (note.archived || note.trashed)) return false;
    if (view === "reminders") return false;
    if (view === "archive" && (!note.archived || note.trashed)) return false;
    if (view === "bin"     && !note.trashed) return false;
    if (!term) return true;
    return note.title.toLowerCase().includes(term) ||
           note.text.toLowerCase().includes(term);
  });
}

function render() {
  const list = visibleNotes();
  const showPinned = view !== "bin";
  const pinned = showPinned ? list.filter((n) => n.pinned) : [];
  const others = showPinned ? list.filter((n) => !n.pinned) : list;

  // Rebuild the two grid sections.
  els.pinnedGrid.innerHTML = "";
  els.othersGrid.innerHTML = "";
  pinned.forEach((n) => els.pinnedGrid.appendChild(buildCard(n)));
  others.forEach((n) => els.othersGrid.appendChild(buildCard(n)));

  // Section headings: "Pinned" always when pinned exist,
  // "Others" only when both sections are shown (like real Keep).
  els.pinnedLabel.hidden = pinned.length === 0;
  els.othersLabel.hidden = !pinned.length || !others.length || !showPinned;

  // Empty state.
  const isEmpty = list.length === 0;
  els.emptyState.hidden = !isEmpty;
  if (isEmpty) {
    els.emptyIcon.textContent = searchTerm ? "search_off" : EMPTY_ICONS[view];
    els.emptyText.textContent = searchTerm
      ? "No notes match your search"
      : EMPTY_MESSAGES[view];
  }

  // The quick-create bar only makes sense in the Notes view.
  els.creator.hidden = view === "reminders";
}

/** Build one note card element. */
function buildCard(note) {
  const card = document.createElement("article");
  card.className = "note-card";
  if (note.pinned) card.classList.add("is-pinned");
  card.dataset.id = String(note.id);
  card.dataset.color = note.color;
  card.innerHTML = `
    <div class="note-body" data-action="open">
      ${note.title ? `<h3 class="note-title">${esc(note.title)}</h3>` : ""}
      ${note.text  ? `<p class="note-text">${esc(note.text)}</p>`   : ""}
    </div>
    <div class="note-actions">${actionButtons(note)}</div>`;
  return card;
}

/** Hover action icons for a card, depending on the current view. */
function actionButtons(note) {
  const icon = (name, action, tooltip) => `
    <button class="icon-btn" data-action="${action}" data-tooltip="${tooltip}" aria-label="${tooltip}">
      <span class="material-symbols-rounded">${name}</span>
    </button>`;

  if (view === "bin") {
    return icon("restore_from_trash", "restore", "Restore") +
           icon("delete_forever", "purge", "Delete forever");
  }

  let html = "";
  if (view === "notes") {
    html += icon("push_pin", "pin", note.pinned ? "Unpin" : "Pin");
  }
  html += icon("palette", "palette", "Background options");
  html += view === "notes"
    ? icon("archive", "archive", "Archive")
    : icon("unarchive", "unarchive", "Unarchive");
  html += icon("delete", "trash", "Delete");
  return html;
}

/* ---------------------------------------------------------------------
   5. Note operations (with Undo support)
   --------------------------------------------------------------------- */
function snapshotForUndo() {
  undoSnapshot = JSON.stringify(notes);
}

function restoreSnapshot() {
  if (!undoSnapshot) return;
  notes = JSON.parse(undoSnapshot);
  undoSnapshot = null;
  save();
  render();
}

function togglePin(id) {
  const note = getNote(id);
  if (note) { note.pinned = !note.pinned; save(); render(); }
}

function setNoteColor(id, color) {
  const note = getNote(id);
  if (note) { note.color = color; save(); render(); }
}

function setArchived(id, archived) {
  const note = getNote(id);
  if (!note) return;
  snapshotForUndo();
  note.archived = archived;
  save(); render();
  showToast(archived ? "Note archived" : "Note unarchived", { undo: restoreSnapshot });
}

function trashNote(id) {
  const note = getNote(id);
  if (!note) return;
  snapshotForUndo();
  note.trashed = true;
  save(); render();
  showToast("Note moved to Bin", { undo: restoreSnapshot });
}

function restoreNote(id) {
  const note = getNote(id);
  if (note) { note.trashed = false; save(); render(); showToast("Note restored"); }
}

function purgeNote(id) {
  snapshotForUndo();
  notes = notes.filter((n) => n.id !== id);
  save(); render();
  showToast("Note deleted forever", { undo: restoreSnapshot });
}

/* ---------------------------------------------------------------------
   6. Toast
   --------------------------------------------------------------------- */
let toastTimer;

function showToast(message, { undo } = {}) {
  els.toastMessage.textContent = message;
  if (undo) {
    els.toastUndo.hidden = false;
    els.toastUndo.onclick = () => { hideToast(); undo(); };
  } else {
    els.toastUndo.hidden = true;
  }
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  els.toast.classList.remove("show");
}

/* ---------------------------------------------------------------------
   7. Modal (create / edit a note)
   --------------------------------------------------------------------- */
function openModal(note) {
  editingId = note ? note.id : null;
  currentColor = note ? note.color : "default";
  els.modalTitle.value = note ? note.title : "";
  els.modalText.value = note ? note.text : "";
  applyModalColor();
  els.modalColors.innerHTML = swatchHTML(currentColor);
  els.modalColors.classList.remove("open");
  els.modalArchive.disabled = !note;   // archive/delete only for existing notes
  els.modalDelete.disabled = !note;
  modalIntent = "save";
  els.dialog.showModal();
  els.modalText.focus();
}

function applyModalColor() {
  const color = PALETTE.find((c) => c.id === currentColor);
  els.modalCard.style.background = color && color.value ? color.value : "";
  els.modalCard.style.color = color && color.value ? "#202124" : "";
}

/** Save (or create) the note when the modal closes. */
els.dialog.addEventListener("close", () => {
  if (modalIntent === "save") {
    const title = els.modalTitle.value.trim();
    const text = els.modalText.value.trim();
    if (editingId) {
      const note = getNote(editingId);
      if (note) Object.assign(note, { title, text, color: currentColor });
    } else if (title || text) {
      notes.unshift({
        id: Date.now(), title, text, color: currentColor,
        pinned: false, archived: false, trashed: false,
      });
    }
    save();
  }
  render();
});

els.modalColors.addEventListener("click", (event) => {
  const swatch = event.target.closest(".swatch");
  if (!swatch) return;
  currentColor = swatch.dataset.colorId;
  applyModalColor();
  els.modalColors.innerHTML = swatchHTML(currentColor);
});

els.modalPalette.addEventListener("click", () => {
  els.modalColors.classList.toggle("open");
});

els.modalArchive.addEventListener("click", () => {
  if (editingId) { setArchived(editingId, true); modalIntent = "archived"; els.dialog.close(); }
});

els.modalDelete.addEventListener("click", () => {
  if (editingId) { trashNote(editingId); modalIntent = "trashed"; els.dialog.close(); }
});

/* ---------------------------------------------------------------------
   8. Colour popover for note cards
   --------------------------------------------------------------------- */
function openPalette(noteId, anchor) {
  paletteTargetId = noteId;
  const note = getNote(noteId);
  els.palettePop.innerHTML =
    `<h3>Background options</h3><div class="palette-pop__grid">${swatchHTML(note ? note.color : "default")}</div>`;
  els.palettePop.hidden = false;

  // Position near the clicked button, clamped to the viewport.
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(rect.bottom + 8, window.innerHeight - 280);
  const left = Math.max(8, Math.min(rect.left - 90, window.innerWidth - 238));
  els.palettePop.style.top = `${top}px`;
  els.palettePop.style.left = `${left}px`;
}

function closePalette() {
  els.palettePop.hidden = true;
  paletteTargetId = null;
}

els.palettePop.addEventListener("click", (event) => {
  const swatch = event.target.closest(".swatch");
  if (swatch && paletteTargetId) setNoteColor(paletteTargetId, swatch.dataset.colorId);
  closePalette();
});

/* ---------------------------------------------------------------------
   9. Global events (delegated clicks, search, keyboard, sidebar)
   --------------------------------------------------------------------- */
document.addEventListener("click", (event) => {
  // Close the colour popover when clicking anywhere else.
  if (!event.target.closest("#palette-pop") && !event.target.closest('[data-action="palette"]')) {
    closePalette();
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const card = actionEl.closest(".note-card");
  const id = card ? Number(card.dataset.id) : null;

  switch (actionEl.dataset.action) {
    case "open":      openModal(id ? getNote(id) : null); break;
    case "pin":       togglePin(id); break;
    case "palette":   openPalette(id, actionEl); break;
    case "archive":   setArchived(id, true); break;
    case "unarchive": setArchived(id, false); break;
    case "trash":     trashNote(id); break;
    case "restore":   restoreNote(id); break;
    case "purge":     purgeNote(id); break;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePalette();
});

els.creator.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openModal(null);
  }
});

els.searchInput.addEventListener("input", () => {
  searchTerm = els.searchInput.value;
  render();
});

// Sidebar navigation
document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    view = button.dataset.view;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    document.body.classList.remove("nav-open");
    render();
  });
});

$("#edit-labels-btn").addEventListener("click", () => {
  showToast("Labels aren't included in this simplified clone");
});

/* ---------------------------------------------------------------------
   10. Top bar: menu, refresh, layout toggle, theme, banner
   --------------------------------------------------------------------- */
$("#menu-btn").addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});

$("#refresh-btn").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.classList.remove("spin");
  void button.offsetWidth;          // restart the CSS animation
  button.classList.add("spin");
  render();
});

$("#layout-btn").addEventListener("click", (event) => {
  const listMode = document.body.classList.toggle("list-view");
  event.currentTarget.querySelector(".material-symbols-rounded").textContent =
    listMode ? "grid_view" : "view_list";
  event.currentTarget.dataset.tooltip = listMode ? "Grid view" : "List view";
});

const themeBtn = $("#theme-btn");

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(THEME_KEY, theme);
  themeBtn.querySelector(".material-symbols-rounded").textContent =
    theme === "dark" ? "light_mode" : "dark_mode";
}
applyTheme(localStorage.getItem(THEME_KEY) ?? "light");
themeBtn.addEventListener("click", () => {
  applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
});

// "Dark theme is here" banner (shown until dismissed)
function dismissBanner() {
  els.banner.hidden = true;
  localStorage.setItem(BANNER_KEY, "1");
}
if (!localStorage.getItem(BANNER_KEY)) els.banner.hidden = false;
$("#banner-dismiss").addEventListener("click", dismissBanner);
$("#banner-enable").addEventListener("click", () => {
  applyTheme("dark");
  dismissBanner();
});

/* ---------------------------------------------------------------------
   11. First paint
   --------------------------------------------------------------------- */
render();
