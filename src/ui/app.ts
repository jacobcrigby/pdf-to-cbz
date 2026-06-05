// SPDX-License-Identifier: AGPL-3.0-or-later
import { startConversion } from '../controller';
import { inputWarning } from '../core/input-warning';
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
      setStatus(elements.warning, '');
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
    void openForm(elements, capabilities, form, file);
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
async function openForm(
  elements: UiElements,
  capabilities: RuntimeCapabilities,
  form: MetadataForm,
  file: File,
): Promise<void> {
  elements.fileInput.disabled = true;
  setStatus(elements.warning, '');
  setStatus(elements.status, 'Reading metadata…');
  try {
    const info = await readPdfMetadata(await file.arrayBuffer());
    const derived = toComicMetadata(info.metadata ?? {}, { fallbackTitle: baseName(file.name) });
    form.show(mergePrefill(derived, loadLastUsed()));
    setStatus(elements.status, '');
    setStatus(
      elements.warning,
      inputWarning({
        fileSizeBytes: file.size,
        pageCount: info.pageCount,
        streamingDelivery: capabilities.fileSystemAccess,
      }) ?? '',
    );
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
  const { cancel, progress, warning, status, fileInput } = elements;
  const aborter = new AbortController();
  const skipped: number[] = [];

  const onCancelClick = (): void => {
    cancel.disabled = true;
    setStatus(status, 'Cancelling…');
    aborter.abort();
  };

  const finishUi = (): void => {
    cancel.hidden = true;
    cancel.disabled = false;
    cancel.removeEventListener('click', onCancelClick);
    progress.hidden = true;
    fileInput.disabled = false;
  };

  setStatus(warning, '');
  progress.removeAttribute('value');
  progress.hidden = false;
  cancel.hidden = false;
  cancel.disabled = false;
  cancel.addEventListener('click', onCancelClick);

  startConversion(
    file,
    capabilities,
    metadata,
    {
      onProgress(page, pageCount) {
        progress.max = pageCount;
        progress.value = page;
        setStatus(status, `Converting page ${page} of ${pageCount}…`);
      },
      onWarning(page) {
        skipped.push(page);
      },
      onDone(filename) {
        finishUi();
        setStatus(status, `Downloaded ${filename}${skipSummary(skipped)}`);
      },
      onCancelled() {
        finishUi();
        setStatus(status, 'Cancelled.');
      },
      onError(message) {
        finishUi();
        setStatus(status, message);
      },
    },
    aborter.signal,
  );
}

// Spec FR-14: a one-line summary of pages skipped (warn-and-continue), listing the
// page numbers when there are few, else just the count.
function skipSummary(skipped: readonly number[]): string {
  if (skipped.length === 0) {
    return '';
  }
  if (skipped.length <= 10) {
    return ` — ${skipped.length} page(s) skipped (${skipped.join(', ')}).`;
  }
  return ` — ${skipped.length} pages skipped.`;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

// The MIME type is empty on some platforms, so fall back to the extension.
function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
