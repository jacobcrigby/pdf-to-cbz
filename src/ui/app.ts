// SPDX-License-Identifier: AGPL-3.0-or-later
import { startConversion } from '../controller';
import type { RuntimeCapabilities } from '../core/runtime-capabilities';
import { setStatus, type UiElements } from './dom';

/** Wire drop/select events on the shell so a chosen PDF starts a conversion job. */
export function initApp(elements: UiElements, capabilities: RuntimeCapabilities): void {
  const { dropzone, fileInput } = elements;

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
    handleSelectedFile(elements, capabilities, event.dataTransfer?.files[0]);
  });

  fileInput.addEventListener('change', () => {
    handleSelectedFile(elements, capabilities, fileInput.files?.[0]);
  });
}

// One PDF at a time: a multi-file drop takes the first and ignores the rest.
function handleSelectedFile(
  elements: UiElements,
  capabilities: RuntimeCapabilities,
  file: File | undefined,
): void {
  if (!file) {
    return;
  }
  if (!isPdf(file)) {
    setStatus(elements.status, 'Choose a PDF file.');
    return;
  }

  elements.fileInput.disabled = true;
  let skipped = 0;
  startConversion(file, capabilities, {
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

// The MIME type is empty on some platforms, so fall back to the extension.
function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
