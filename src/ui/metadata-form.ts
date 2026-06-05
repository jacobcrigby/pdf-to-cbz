// SPDX-License-Identifier: AGPL-3.0-or-later
import { PROVENANCE_NOTE, type ComicMetadata } from '../core/pdf-metadata';

type FieldKey = Exclude<keyof ComicMetadata, 'notes'>;

// A select choice: `value` is what ComicInfo.xml stores, `label` is what the user sees.
interface SelectOption {
  readonly value: string;
  readonly label: string;
}

// A form control. Most map to a single ComicMetadata key. `multitext` writes one value
// to several keys at once (e.g. a zine's sole artist fills every art-credit role); `date`
// spans the year/month/day trio so it can render as one native date picker.
type FieldDef =
  | {
      readonly kind: 'text' | 'number' | 'url' | 'textarea';
      readonly key: FieldKey;
      readonly label: string;
      readonly placeholder?: string;
      readonly hint?: string;
      readonly persist: boolean;
    }
  | {
      readonly kind: 'select';
      readonly key: FieldKey;
      readonly label: string;
      readonly options: readonly SelectOption[];
      readonly persist: boolean;
    }
  | {
      readonly kind: 'multitext';
      readonly keys: readonly FieldKey[];
      readonly label: string;
      readonly placeholder?: string;
      readonly hint?: string;
      readonly persist: boolean;
    }
  | {
      readonly kind: 'date';
      readonly keys: readonly FieldKey[];
      readonly label: string;
      readonly persist: boolean;
    };

// Values are the ComicInfo `Manga` enum; labels read plainly for the user.
const READING_DIRECTION: readonly SelectOption[] = [
  { value: '', label: 'Unspecified' },
  { value: 'No', label: 'Left to right (Western)' },
  { value: 'Yes', label: 'Manga' },
  { value: 'YesAndRightToLeft', label: 'Manga, right to left' },
];

// The ComicInfo `AgeRating` enum (a free-text value risks failing schema validation).
const AGE_RATINGS: readonly SelectOption[] = [
  '',
  'Everyone',
  'Everyone 10+',
  'G',
  'PG',
  'Kids to Adults',
  'Teen',
  'M',
  'MA15+',
  'Mature 17+',
  'R18+',
  'Adults Only 18+',
  'X18+',
  'Early Childhood',
  'Rating Pending',
].map((value) => ({ value, label: value === '' ? 'Unspecified' : value }));

// Common languages by name; the stored value is the ISO 639-1 code most readers expect.
// English leads (the primary audience), then alphabetical. An unlisted prefilled code is
// added on the fly in `show`, so nothing is lost.
const LANGUAGES: readonly SelectOption[] = [
  { value: '', label: 'Unspecified' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'no', label: 'Norwegian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'vi', label: 'Vietnamese' },
];

// Visual-art roles a single person usually fills on a self-published comic.
const ART_ROLES: readonly FieldKey[] = [
  'penciller',
  'inker',
  'colorist',
  'letterer',
  'coverArtist',
];

// Ordered by importance for the zine / self-published use case: identity and creators
// first, then the story, then categorization, publishing, and finally niche fields.
const FIELDS: readonly FieldDef[] = [
  { key: 'title', label: 'Title', kind: 'text', persist: false },
  { key: 'writer', label: 'Writer', kind: 'text', persist: true },
  {
    kind: 'multitext',
    keys: ART_ROLES,
    label: 'Artist',
    hint: 'Sets penciller, inker, colorist, letterer, and cover artist to one name.',
    persist: true,
  },
  { key: 'series', label: 'Series', kind: 'text', persist: true },
  { key: 'number', label: 'Number', kind: 'text', placeholder: 'e.g. 1', persist: false },
  { key: 'summary', label: 'Summary', kind: 'textarea', persist: false },
  { kind: 'date', keys: ['year', 'month', 'day'], label: 'Publication date', persist: false },
  { key: 'genre', label: 'Genre', kind: 'text', placeholder: 'comma, separated', persist: true },
  { key: 'tags', label: 'Tags', kind: 'text', placeholder: 'comma, separated', persist: true },
  { key: 'publisher', label: 'Publisher', kind: 'text', persist: true },
  { key: 'web', label: 'Web', kind: 'url', placeholder: 'https://…', persist: true },
  { key: 'editor', label: 'Editor', kind: 'text', persist: true },
  { key: 'volume', label: 'Volume', kind: 'number', placeholder: 'e.g. 1', persist: true },
  { key: 'count', label: 'Count', kind: 'number', placeholder: 'issues in series', persist: true },
  { key: 'languageISO', label: 'Language', kind: 'select', options: LANGUAGES, persist: true },
  {
    key: 'manga',
    label: 'Reading direction',
    kind: 'select',
    options: READING_DIRECTION,
    persist: true,
  },
  { key: 'ageRating', label: 'Age rating', kind: 'select', options: AGE_RATINGS, persist: true },
];

const STORAGE_KEY = 'pdf-to-cbz:last-metadata';

/** The metadata keys a control owns (one for most, several for `multitext`/`date`). */
function defKeys(def: FieldDef): readonly FieldKey[] {
  return def.kind === 'multitext' || def.kind === 'date' ? def.keys : [def.key];
}

// Flatten the controls to the metadata keys they cover, with each key's persistence.
function keyPersistPairs(): readonly { key: FieldKey; persist: boolean }[] {
  return FIELDS.flatMap((def) => defKeys(def).map((key) => ({ key, persist: def.persist })));
}

/** Pre-fill value per field: the PDF-derived value wins, else the last-used one. */
export function mergePrefill(pdfDerived: ComicMetadata, lastUsed: ComicMetadata): ComicMetadata {
  const merged: Record<string, string> = {};
  for (const { key } of keyPersistPairs()) {
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
  for (const { key, persist } of keyPersistPairs()) {
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

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Combine ComicInfo year/month/day strings into a native date input value, else ''. */
export function partsToDateValue(year?: string, month?: string, day?: string): string {
  if (!year || !month || !day) {
    return '';
  }
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Parse a native `YYYY-MM-DD` date input value back into calendar parts. */
export function dateValueToParts(value: string): DateParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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

interface Control {
  readonly def: FieldDef;
  readonly el: Field;
}

/** Build the metadata form into `container` and wire its Convert/Cancel buttons. */
export function createMetadataForm(
  container: HTMLElement,
  handlers: MetadataFormHandlers,
): MetadataForm {
  const controls: Control[] = [];
  const form = document.createElement('form');
  form.className = 'metadata-form';

  for (const def of FIELDS) {
    const id = `meta-${'key' in def ? def.key : slug(def.label)}`;
    const row = document.createElement('div');
    row.className = 'metadata-row';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = def.label;

    const el = createField(def);
    el.id = id;
    controls.push({ def, el });

    row.append(label, el);
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
    handlers.onConvert(readValues(controls));
  });
  cancel.addEventListener('click', () => handlers.onCancel());

  return {
    show(prefill) {
      for (const { def, el } of controls) {
        if (def.kind === 'date') {
          el.value = partsToDateValue(prefill.year, prefill.month, prefill.day);
        } else if (def.kind === 'multitext') {
          el.value = firstPresent(prefill, def.keys);
        } else if (def.kind === 'select') {
          el.value = ensureOption(el as HTMLSelectElement, prefill[def.key]);
        } else {
          el.value = prefill[def.key] ?? '';
        }
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
    area.rows = 3;
    applyHints(area, def.placeholder, def.hint);
    return area;
  }
  if (def.kind === 'select') {
    const select = document.createElement('select');
    for (const option of def.options) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      select.append(el);
    }
    return select;
  }
  const input = document.createElement('input');
  if (def.kind === 'date') {
    input.type = 'date';
    return input;
  }
  input.type = def.kind === 'number' ? 'number' : def.kind === 'url' ? 'url' : 'text';
  if (def.kind === 'number') {
    input.inputMode = 'numeric';
  }
  applyHints(input, def.placeholder, def.hint);
  return input;
}

function applyHints(
  el: HTMLInputElement | HTMLTextAreaElement,
  placeholder?: string,
  hint?: string,
): void {
  if (placeholder) {
    el.placeholder = placeholder;
  }
  if (hint) {
    el.title = hint;
  }
}

// A select can only show values it has options for; add a prefilled code that isn't in
// the list (e.g. a `zh-Hant` language tag) so the value round-trips instead of vanishing.
function ensureOption(select: HTMLSelectElement, value: string | undefined): string {
  if (value && !Array.from(select.options).some((option) => option.value === value)) {
    const extra = document.createElement('option');
    extra.value = value;
    extra.textContent = value;
    select.append(extra);
  }
  return value ?? '';
}

function firstPresent(prefill: ComicMetadata, keys: readonly FieldKey[]): string {
  for (const key of keys) {
    const value = prefill[key];
    if (value) {
      return value;
    }
  }
  return '';
}

function readValues(controls: readonly Control[]): ComicMetadata {
  const result: Record<string, string> = {};
  for (const { def, el } of controls) {
    const value = el.value.trim();
    if (def.kind === 'date') {
      const parts = dateValueToParts(value);
      if (parts) {
        result.year = String(parts.year);
        result.month = String(parts.month);
        result.day = String(parts.day);
      }
    } else if (def.kind === 'multitext') {
      if (value) {
        for (const key of def.keys) {
          result[key] = value;
        }
      }
    } else if (value) {
      result[def.key] = value;
    }
  }
  // The provenance note is always recorded; it is not a user field.
  return { ...result, notes: PROVENANCE_NOTE };
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
