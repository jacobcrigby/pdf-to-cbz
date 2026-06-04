// SPDX-License-Identifier: AGPL-3.0-or-later
import { PROVENANCE_NOTE, type ComicMetadata } from '../core/pdf-metadata';

type FieldKey = Exclude<keyof ComicMetadata, 'notes'>;

interface FieldDef {
  readonly key: FieldKey;
  readonly label: string;
  readonly kind: 'text' | 'textarea' | 'select';
  readonly options?: readonly string[];
  // Whether the value carries over to the next file via localStorage. Per-issue
  // fields (title, dates, number, summary) do not; series-level ones do.
  readonly persist: boolean;
}

const FIELDS: readonly FieldDef[] = [
  { key: 'title', label: 'Title', kind: 'text', persist: false },
  { key: 'series', label: 'Series', kind: 'text', persist: true },
  { key: 'number', label: 'Number', kind: 'text', persist: false },
  { key: 'count', label: 'Count', kind: 'text', persist: true },
  { key: 'volume', label: 'Volume', kind: 'text', persist: true },
  { key: 'summary', label: 'Summary', kind: 'textarea', persist: false },
  { key: 'year', label: 'Year', kind: 'text', persist: false },
  { key: 'month', label: 'Month', kind: 'text', persist: false },
  { key: 'day', label: 'Day', kind: 'text', persist: false },
  { key: 'writer', label: 'Writer', kind: 'text', persist: true },
  { key: 'penciller', label: 'Penciller', kind: 'text', persist: true },
  { key: 'inker', label: 'Inker', kind: 'text', persist: true },
  { key: 'colorist', label: 'Colorist', kind: 'text', persist: true },
  { key: 'letterer', label: 'Letterer', kind: 'text', persist: true },
  { key: 'coverArtist', label: 'Cover artist', kind: 'text', persist: true },
  { key: 'editor', label: 'Editor', kind: 'text', persist: true },
  { key: 'publisher', label: 'Publisher', kind: 'text', persist: true },
  { key: 'genre', label: 'Genre', kind: 'text', persist: true },
  { key: 'tags', label: 'Tags', kind: 'text', persist: true },
  { key: 'web', label: 'Web', kind: 'text', persist: true },
  { key: 'languageISO', label: 'Language (ISO)', kind: 'text', persist: true },
  {
    key: 'manga',
    label: 'Reading direction',
    kind: 'select',
    options: ['', 'No', 'Yes', 'YesAndRightToLeft'],
    persist: true,
  },
  { key: 'ageRating', label: 'Age rating', kind: 'text', persist: true },
];

const STORAGE_KEY = 'pdf-to-cbz:last-metadata';

/** Pre-fill value per field: the PDF-derived value wins, else the last-used one. */
export function mergePrefill(pdfDerived: ComicMetadata, lastUsed: ComicMetadata): ComicMetadata {
  const merged: Record<string, string> = {};
  for (const { key } of FIELDS) {
    const value = pdfDerived[key] ?? lastUsed[key];
    if (value !== undefined && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

/** Keep only the fields worth carrying over to the next conversion. */
export function persistableFields(metadata: ComicMetadata): ComicMetadata {
  const kept: Record<string, string> = {};
  for (const { key, persist } of FIELDS) {
    const value = metadata[key];
    if (persist && value) {
      kept[key] = value;
    }
  }
  return kept;
}

export function loadLastUsed(): ComicMetadata {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ComicMetadata) : {};
  } catch {
    return {};
  }
}

export function saveLastUsed(metadata: ComicMetadata): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableFields(metadata)));
  } catch {
    // Persistence is a convenience; ignore quota/privacy-mode failures.
  }
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface MetadataForm {
  show(prefill: ComicMetadata): void;
  hide(): void;
}

export interface MetadataFormHandlers {
  onConvert(metadata: ComicMetadata): void;
  onCancel(): void;
}

/** Build the metadata form into `container` and wire its Convert/Cancel buttons. */
export function createMetadataForm(
  container: HTMLElement,
  handlers: MetadataFormHandlers,
): MetadataForm {
  const fields = new Map<FieldKey, Field>();
  const form = document.createElement('form');
  form.className = 'metadata-form';

  for (const def of FIELDS) {
    const id = `meta-${def.key}`;
    const row = document.createElement('div');
    row.className = 'metadata-row';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = def.label;

    const input = createField(def);
    input.id = id;
    fields.set(def.key, input);

    row.append(label, input);
    form.append(row);
  }

  const actions = document.createElement('div');
  actions.className = 'metadata-actions';
  const convert = document.createElement('button');
  convert.type = 'submit';
  convert.textContent = 'Convert';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(convert, cancel);
  form.append(actions);
  container.append(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onConvert(readValues(fields));
  });
  cancel.addEventListener('click', () => handlers.onCancel());

  return {
    show(prefill) {
      for (const [key, field] of fields) {
        field.value = prefill[key] ?? '';
      }
      container.hidden = false;
    },
    hide() {
      container.hidden = true;
    },
  };
}

function createField(def: FieldDef): Field {
  if (def.kind === 'textarea') {
    const area = document.createElement('textarea');
    area.rows = 2;
    return area;
  }
  if (def.kind === 'select') {
    const select = document.createElement('select');
    for (const option of def.options ?? []) {
      const el = document.createElement('option');
      el.value = option;
      el.textContent = option === '' ? '(unset)' : option;
      select.append(el);
    }
    return select;
  }
  const input = document.createElement('input');
  input.type = 'text';
  return input;
}

function readValues(fields: Map<FieldKey, Field>): ComicMetadata {
  const result: Record<string, string> = {};
  for (const [key, field] of fields) {
    const value = field.value.trim();
    if (value) {
      result[key] = value;
    }
  }
  // The provenance note is always recorded; it is not a user field.
  return { ...result, notes: PROVENANCE_NOTE };
}
