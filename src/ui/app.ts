// SPDX-License-Identifier: AGPL-3.0-or-later
import { setStatus, type UiElements } from './dom';

/** Wire drop/select events on the shell. The conversion job lands in later phases. */
export function initApp(elements: UiElements): void {
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
    handleSelectedFile(elements, event.dataTransfer?.files[0]);
  });

  fileInput.addEventListener('change', () => {
    handleSelectedFile(elements, fileInput.files?.[0]);
  });
}

// One PDF at a time: a multi-file drop takes the first and ignores the rest.
function handleSelectedFile(elements: UiElements, file: File | undefined): void {
  if (!file) {
    return;
  }
  if (!isPdf(file)) {
    setStatus(elements.status, 'Choose a PDF file.');
    return;
  }
  setStatus(elements.status, `Selected: ${file.name} · ${formatBytes(file.size)}`);
}

// The MIME type is empty on some platforms, so fall back to the extension.
function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
