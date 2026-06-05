// SPDX-License-Identifier: AGPL-3.0-or-later
import { PROVENANCE_NOTE, type ComicMetadata } from '../core/pdf-metadata';

type FieldKey = Exclude<keyof ComicMetadata, 'notes'>;

// A select choice: `value` is what ComicInfo.xml stores, `label` is what the user sees.
interface SelectOption {
  readonly value: string;
  readonly label: string;
}

// A form control. Most map to a single ComicMetadata key. `date` spans the year/month/day
// trio so it renders as one native date picker; `credits` is the collapsible writer/artist
// block (see CREDIT_KEYS).
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
      readonly kind: 'date';
      readonly keys: readonly FieldKey[];
      readonly label: string;
      readonly persist: boolean;
    }
  | { readonly kind: 'credits' };

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
// English then Japanese lead (the primary audiences), then alphabetical. An unlisted
// prefilled code is added on the fly in `show`, so nothing is lost.
const LANGUAGES: readonly SelectOption[] = [
  { value: '', label: 'Unspecified' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
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

// The visual-art roles one person usually fills on a self-published comic, and the full
// credit set (writer + art) the collapsed "Writer & artist" field drives at once.
const ART_ROLE_FIELDS: readonly { readonly key: FieldKey; readonly label: string }[] = [
  { key: 'penciller', label: 'Penciller' },
  { key: 'inker', label: 'Inker' },
  { key: 'colorist', label: 'Colorist' },
  { key: 'letterer', label: 'Letterer' },
  { key: 'coverArtist', label: 'Cover artist' },
];
const CREDIT_KEYS: readonly FieldKey[] = ['writer', ...ART_ROLE_FIELDS.map((f) => f.key)];

// Ordered by importance for the zine / self-published use case: identity and creators
// first, then the story, then categorization, publishing, and finally niche fields.
const FIELDS: readonly FieldDef[] = [
  { key: 'title', label: 'Title', kind: 'text', persist: false },
  { kind: 'credits' },
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
const SEPARATE_CREDITS_KEY = 'pdf-to-cbz:separate-credits';

// Flatten the controls to the metadata keys they cover, with each key's persistence.
// Credit keys (writer + art roles) always carry over.
function keyPersistPairs(): readonly { key: FieldKey; persist: boolean }[] {
  return FIELDS.flatMap((def) => {
    if (def.kind === 'credits') {
      return CREDIT_KEYS.map((key) => ({ key, persist: true }));
    }
    if (def.kind === 'date') {
      return def.keys.map((key) => ({ key, persist: def.persist }));
    }
    return [{ key: def.key, persist: def.persist }];
  });
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

/**
 * Whether the credit values can be merged into the single "Writer & artist" field without
 * losing a distinction: true when every set credit shares one name (so the collapsed view
 * is safe), false when they differ (so the form opens with art credits separated).
 */
export function creditsUniform(prefill: ComicMetadata): boolean {
  const present = CREDIT_KEYS.map((key) => prefill[key]).filter(
    (value): value is string => !!value,
  );
  return present.length === 0 || present.every((value) => value === present[0]);
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
  readonly def: Exclude<FieldDef, { kind: 'credits' }>;
  readonly el: Field;
}

interface CreditsBlock {
  apply(prefill: ComicMetadata): void;
  collect(result: Record<string, string>): void;
}

/** Build the metadata form into `container` and wire its Convert/Cancel buttons. */
export function createMetadataForm(
  container: HTMLElement,
  handlers: MetadataFormHandlers,
): MetadataForm {
  const controls: Control[] = [];
  const form = document.createElement('form');
  form.className = 'metadata-form';

  // Actions sit above the fields so Convert is reachable without scrolling the long form.
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

  let credits: CreditsBlock | undefined;
  for (const def of FIELDS) {
    if (def.kind === 'credits') {
      credits = buildCredits(form);
      continue;
    }
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

  container.append(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onConvert(readValues(controls, credits));
  });
  cancel.addEventListener('click', () => handlers.onCancel());

  return {
    show(prefill) {
      credits?.apply(prefill);
      for (const { def, el } of controls) {
        if (def.kind === 'date') {
          el.value = partsToDateValue(prefill.year, prefill.month, prefill.day);
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

// The writer/artist block: one "Writer & artist" field by default (filling writer and every
// art role), with a "Separate art credits" toggle that swaps in per-role fields. The toggle
// choice persists, and a prefill with differing credits opens already separated.
function buildCredits(form: HTMLFormElement): CreditsBlock {
  const toggle = document.createElement('label');
  toggle.className = 'metadata-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'meta-separate-credits';
  toggle.append(checkbox, document.createTextNode(' Separate art credits'));

  const combinedRow = makeRow('meta-writer-artist', 'Writer & artist');
  const combined = makeInput('meta-writer-artist');
  combined.title = 'Sets the writer and every art role to one name.';
  combinedRow.append(combined);

  const expanded = document.createElement('div');
  expanded.className = 'credits-expanded';
  const writerRow = makeRow('meta-writer', 'Writer');
  const writer = makeInput('meta-writer');
  writerRow.append(writer);
  expanded.append(writerRow);
  const artInputs = ART_ROLE_FIELDS.map(({ key, label }) => {
    const id = `meta-${key}`;
    const row = makeRow(id, label);
    const el = makeInput(id);
    row.append(el);
    expanded.append(row);
    return { key, el };
  });

  form.append(toggle, combinedRow, expanded);

  const setMode = (separate: boolean): void => {
    combinedRow.hidden = separate;
    expanded.hidden = !separate;
  };

  checkbox.addEventListener('change', () => {
    const separate = checkbox.checked;
    if (separate) {
      // Carry the combined name into any empty per-role field so it is not lost.
      const value = combined.value.trim();
      if (value) {
        if (!writer.value) writer.value = value;
        for (const art of artInputs) if (!art.el.value) art.el.value = value;
      }
    } else {
      combined.value = writer.value || artInputs.find((art) => art.el.value)?.el.value || '';
    }
    setMode(separate);
    saveSeparateCredits(separate);
  });

  return {
    apply(prefill) {
      writer.value = prefill.writer ?? '';
      for (const art of artInputs) art.el.value = prefill[art.key] ?? '';
      combined.value = firstPresent(prefill, CREDIT_KEYS);
      const separate = !creditsUniform(prefill) || loadSeparateCredits();
      checkbox.checked = separate;
      setMode(separate);
    },
    collect(result) {
      if (checkbox.checked) {
        const w = writer.value.trim();
        if (w) result.writer = w;
        for (const art of artInputs) {
          const value = art.el.value.trim();
          if (value) result[art.key] = value;
        }
      } else {
        const value = combined.value.trim();
        if (value) {
          for (const key of CREDIT_KEYS) result[key] = value;
        }
      }
    },
  };
}

function loadSeparateCredits(): boolean {
  try {
    return localStorage.getItem(SEPARATE_CREDITS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveSeparateCredits(separate: boolean): void {
  try {
    localStorage.setItem(SEPARATE_CREDITS_KEY, separate ? '1' : '0');
  } catch {
    // Persisting the toggle is a convenience; ignore storage failures.
  }
}

function makeRow(id: string, labelText: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'metadata-row';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  row.append(label);
  return row;
}

function makeInput(id: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  return input;
}

function createField(def: Exclude<FieldDef, { kind: 'credits' }>): Field {
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

function readValues(
  controls: readonly Control[],
  credits: CreditsBlock | undefined,
): ComicMetadata {
  const result: Record<string, string> = {};
  credits?.collect(result);
  for (const { def, el } of controls) {
    const value = el.value.trim();
    if (def.kind === 'date') {
      const parts = dateValueToParts(value);
      if (parts) {
        result.year = String(parts.year);
        result.month = String(parts.month);
        result.day = String(parts.day);
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
