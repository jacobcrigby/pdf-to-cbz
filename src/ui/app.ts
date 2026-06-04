// SPDX-License-Identifier: AGPL-3.0-or-later
import { startConversion } from '../controller';
import { toComicMetadata, type ComicMetadata } from '../core/pdf-metadata';
import type { RuntimeCapabilities } from '../core/runtime-capabilities';
import { readPdfMetadata } from '../worker/pool';
import { setStatus, type UiElements } from './dom';
import {
  createMetadataForm,
  loadLastUsed,
  mergePrefill,
  saveLastUsed,
  type MetadataForm,
} from './metadata-form';

/** Wire drop/select events so a chosen PDF opens the metadata form, then converts. */
export function initApp(elements: UiElements, capabilities: RuntimeCapabilities): void {
  const { dropzone, fileInput } = elements;
  let selected: File | undefined;

  const form: MetadataForm = createMetadataForm(elements.metadata, {
    onConvert: (metadata) => {
      form.hide();
      saveLastUsed(metadata);
      if (selected) {
        convert(elements, capabilities, selected, metadata);
      }
    },
    onCancel: () => {
      form.hide();
      selected = undefined;
      fileInput.disabled = false;
      setStatus(elements.status, '');
    },
  });

  const onFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    if (!isPdf(file)) {
      setStatus(elements.status, 'Choose a PDF file.');
      return;
    }
    selected = file;
    void openForm(elements, form, file);
  };

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragging');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    onFile(event.dataTransfer?.files[0]);
  });
  fileInput.addEventListener('change', () => onFile(fileInput.files?.[0]));
}

// Read the PDF's own metadata, then show the form pre-filled (PDF values win,
// falling back to the last-used values persisted from a previous conversion).
async function openForm(elements: UiElements, form: MetadataForm, file: File): Promise<void> {
  elements.fileInput.disabled = true;
  setStatus(elements.status, 'Reading metadata…');
  try {
    const raw = await readPdfMetadata(await file.arrayBuffer());
    const derived = toComicMetadata(raw ?? {}, { fallbackTitle: baseName(file.name) });
    form.show(mergePrefill(derived, loadLastUsed()));
    setStatus(elements.status, '');
  } catch (error) {
    elements.fileInput.disabled = false;
    setStatus(elements.status, error instanceof Error ? error.message : 'Could not read this PDF.');
  }
}

function convert(
  elements: UiElements,
  capabilities: RuntimeCapabilities,
  file: File,
  metadata: ComicMetadata,
): void {
  let skipped = 0;
  startConversion(file, capabilities, metadata, {
    onProgress(page, pageCount) {
      setStatus(elements.status, `Converting page ${page} of ${pageCount}…`);
    },
    onWarning() {
      skipped += 1;
    },
    onDone(filename) {
      elements.fileInput.disabled = false;
      const note = skipped > 0 ? ` (${skipped} page(s) skipped)` : '';
      setStatus(elements.status, `Downloaded ${filename}${note}`);
    },
    onError(message) {
      elements.fileInput.disabled = false;
      setStatus(elements.status, message);
    },
  });
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

// The MIME type is empty on some platforms, so fall back to the extension.
function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
