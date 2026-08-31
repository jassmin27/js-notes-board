"use strict";

const STORAGE_KEY = "js-notes-board";
const SEARCH_DEBOUNCE_MS = 300;

// ============================================================
// DOM
// ============================================================

function getElements() {
  return {
    addNoteForm: document.querySelector(".add-note-form"),
    addNoteStatus: document.querySelector(".add-note-status"),
    notesControls: document.querySelector(".notes-controls"),
    searchNotesInput: document.querySelector("#search-notes-text"),
    notesSection: document.querySelector(".notes-section"),
    noteCards: document.querySelector(".note-cards"),
    template: document.querySelector("#note-card-template"),
  };
}

// ============================================================
// STORAGE
// ============================================================

function loadNotesFromStorage() {
  const savedNotes = localStorage.getItem(STORAGE_KEY);

  if (!savedNotes) return [];

  try {
    const parsedNotes = JSON.parse(savedNotes);
    return Array.isArray(parsedNotes) ? parsedNotes : [];
  } catch (error) {
    console.error("Failed to load notes from localStorage:", error);
    return [];
  }
}

function saveNotesToStorage(notes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error("Failed to save notes to localStorage:", error);
  }
}

// ============================================================
// STORE
// ============================================================

function createNotesStore() {
  let notes = loadNotesFromStorage();
  let activeTag = "";
  let searchText = "";

  const listeners = [];

  function notify() {
    for (const listener of listeners) {
      listener([...notes], activeTag, searchText);
    }
  }

  return {
    addNote(note) {
      notes = [...notes, note];
      saveNotesToStorage(notes);
      notify();
    },

    removeNote(id) {
      notes = notes.filter((note) => note.id !== id);

      if (notes.length === 0) {
        activeTag = "";
        searchText = "";
      } else if (activeTag) {
        const activeTagStillExists = notes.some((note) =>
          note.tags.includes(activeTag),
        );

        if (!activeTagStillExists) {
          activeTag = "";
        }
      }

      saveNotesToStorage(notes);
      notify();

      return notes.length === 0;
    },

    setActiveTag(tag) {
      activeTag = tag;
      notify();
    },

    setSearchText(text) {
      searchText = text;
      notify();
    },

    subscribe(listener) {
      listeners.push(listener);
      listener([...notes], activeTag, searchText);
    },
  };
}

// ============================================================
// NOTE HELPERS
// ============================================================

function createNoteFromForm(form) {
  const formData = new FormData(form);

  const title = formData.get("title").trim();
  const content = formData.get("content").trim();

  if (!title || !content) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    title,
    content,
    tags: parseTags(formData.get("tags")),
  };
}

function parseTags(tagsText) {
  return [
    ...new Set(
      tagsText
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function getVisibleNotes(notes, activeTag, searchText) {
  const normalizedSearchText = searchText.trim().toLowerCase();

  let visibleNotes = notes;

  if (activeTag) {
    visibleNotes = visibleNotes.filter((note) => note.tags.includes(activeTag));
  }

  if (normalizedSearchText) {
    visibleNotes = visibleNotes.filter((note) => {
      const searchableText = `${note.title} ${note.content}`.toLowerCase();

      return searchableText.includes(normalizedSearchText);
    });
  }

  return visibleNotes;
}

function getTagsSummary(notes) {
  const tagCounts = new Map();

  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================
// RENDER
// ============================================================

function render(notes, activeTag, searchText, elements) {
  const { noteCards, notesSection, notesControls, template } = elements;

  noteCards.replaceChildren();

  if (notes.length === 0) {
    setNotesVisibility(notesSection, notesControls, false);
    return;
  }

  setNotesVisibility(notesSection, notesControls, true);
  renderTagFilters(notes, notesControls, activeTag);

  const visibleNotes = getVisibleNotes(notes, activeTag, searchText);

  if (visibleNotes.length === 0) {
    const message = document.createElement("p");
    message.className = "no-notes-message";
    message.textContent = "No notes found.";

    noteCards.appendChild(message);
    return;
  }

  for (const note of visibleNotes) {
    const noteFragment = template.content.cloneNode(true);

    populateNoteCard(noteFragment, note);
    noteCards.appendChild(noteFragment);
  }
}

function populateNoteCard(fragment, note) {
  const noteCard = fragment.querySelector(".note-card");
  const footer = fragment.querySelector("footer");
  const tagsContainer = fragment.querySelector(".tags");

  noteCard.dataset.id = note.id;

  fragment.querySelector("h3").textContent = note.title;
  fragment.querySelector(".content p").textContent = note.content;

  if (note.tags.length === 0) {
    footer.remove();
    return;
  }

  for (const tag of note.tags) {
    tagsContainer.appendChild(createTag(tag));
  }
}

function createTag(tagName) {
  const tagElement = document.createElement("span");

  tagElement.className = "tag";
  tagElement.textContent = tagName;

  return tagElement;
}

function renderTagFilters(notes, notesControls, activeTag) {
  const filterPills = notesControls.querySelector(".filter-pills");

  filterPills.replaceChildren();

  filterPills.appendChild(
    createTagFilterPill("All", notes.length, activeTag === ""),
  );

  for (const tag of getTagsSummary(notes)) {
    filterPills.appendChild(
      createTagFilterPill(tag.name, tag.count, activeTag === tag.name),
    );
  }
}

function createTagFilterPill(tagName, tagCount, isActive) {
  const button = document.createElement("button");

  button.type = "button";
  button.dataset.tag = tagName;
  button.className = "filter-pill";

  button.classList.toggle("active", isActive);
  button.textContent = `${tagName} (${tagCount})`;

  return button;
}

function setNotesVisibility(notesSection, notesControls, show) {
  notesControls.classList.toggle("hidden", !show);
  notesSection.classList.toggle("hidden", !show);
}

function setNoteStatus(statusElement, message, statusClass = "") {
  statusElement.textContent = message;
  statusElement.className = "add-note-status";

  if (statusClass) {
    statusElement.classList.add(statusClass);
  }
}

// ============================================================
// CONTROLLER
// ============================================================

function createAppController(store, elements) {
  return {
    addNote(event) {
      event.preventDefault();

      const note = createNoteFromForm(elements.addNoteForm);

      if (!note) {
        setNoteStatus(
          elements.addNoteStatus,
          "Please enter a title and note.",
          "error",
        );

        return;
      }

      store.addNote(note);
      elements.addNoteForm.reset();

      setNoteStatus(
        elements.addNoteStatus,
        "Note added successfully!",
        "success",
      );
    },

    deleteNote(id) {
      const allNotesDeleted = store.removeNote(id);

      if (allNotesDeleted) {
        elements.searchNotesInput.value = "";
      }

      setNoteStatus(elements.addNoteStatus, "");
    },

    filterNotes(tag) {
      store.setActiveTag(tag);
    },

    searchNotes(searchText) {
      store.setSearchText(searchText);
    },
  };
}

// ============================================================
// EVENTS
// ============================================================

function bindEvents(elements, appController) {
  elements.addNoteForm.addEventListener("input", () => {
    setNoteStatus(elements.addNoteStatus, "");
  });

  elements.addNoteForm.addEventListener("submit", appController.addNote);

  elements.notesSection.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-note-btn");

    if (!deleteButton) return;

    const noteCard = deleteButton.closest(".note-card");

    if (!noteCard) return;

    appController.deleteNote(noteCard.dataset.id);
  });

  elements.notesControls.addEventListener("click", (event) => {
    const filterPill = event.target.closest(".filter-pill");

    if (!filterPill) return;

    const tagName = filterPill.dataset.tag;

    appController.filterNotes(tagName === "All" ? "" : tagName);
  });

  const debouncedSearch = debounce(
    () => appController.searchNotes(elements.searchNotesInput.value),
    SEARCH_DEBOUNCE_MS,
  );

  elements.searchNotesInput.addEventListener("input", debouncedSearch);
}

function debounce(callback, delay) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

// ============================================================
// INIT
// ============================================================

function initApp() {
  const elements = getElements();
  const store = createNotesStore();
  const appController = createAppController(store, elements);

  store.subscribe((notes, activeTag, searchText) => {
    render(notes, activeTag, searchText, elements);
  });

  bindEvents(elements, appController);
}

initApp();
