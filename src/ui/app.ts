// SPDX-License-Identifier: AGPL-3.0-or-later
import { startConversion } from '../controller';
import { inputWarning } from '../core/input-warning';
import { stripPdfExtension, type PageExt } from '../core/naming';
import { toComicMetadata, type ComicMetadata } from '../core/pdf-metadata';
import { poolSize } from '../core/pool-size';
import type { RuntimeCapabilities } from '../core/runtime-capabilities';
import { openPool, type RenderPool } from '../worker/pool';
import { setStatus, type UiElements } from './dom';
import {
  createMetadataForm,
  loadLastUsed,
  mergePrefill,
  saveLastUsed,
  type MetadataForm,
} from './metadata-form';

// A PDF chosen and opened, awaiting the user's Convert/Cancel. The pool stays open
// through form editing and is reused for conversion, so the file is parsed once.
interface OpenSession {
  readonly pool: RenderPool;
  readonly file: File;
  readonly ext: PageExt;
}

/** Wire drop/select events so a chosen PDF opens the metadata form, then converts. */
export function initApp(elements: UiElements, capabilities: RuntimeCapabilities): void {
  const { dropzone, fileInput } = elements;
  let session: OpenSession | undefined;
  // Bumped on every new selection so a slow open can tell it has been superseded.
  let generation = 0;

  // Tear down an open-but-not-yet-converted pool (new file chosen, or cancelled).
  const closeSession = (): void => {
    session?.pool.terminate();
    session = undefined;
  };

  const form: MetadataForm = createMetadataForm(elements.metadata, {
    onConvert: (metadata) => {
      form.hide();
      saveLastUsed(metadata);
      if (session) {
        const active = session;
        // The controller now owns the pool's lifetime through conversion.
        session = undefined;
        convert(elements, capabilities, active, metadata);
      }
    },
    onCancel: () => {
      form.hide();
      closeSession();
      fileInput.disabled = false;
      setStatus(elements.warning, '');
      setStatus(elements.status, '');
    },
  });

  // Open the render pool (which also reads the PDF's metadata), then show the form
  // pre-filled — PDF values win, falling back to last-used values from a prior run.
  const openForm = async (file: File): Promise<void> => {
    if (!capabilities.offscreenCanvas || !capabilities.moduleWorkers) {
      setStatus(elements.status, 'This browser is not supported yet.');
      return;
    }
    const gen = generation;
    fileInput.disabled = true;
    setStatus(elements.warning, '');
    setStatus(elements.status, 'Reading metadata…');
    try {
      const buffer = await file.arrayBuffer();
      const ext: PageExt = capabilities.webpEncode ? 'webp' : 'jpg';
      const encodeType = capabilities.webpEncode ? 'image/webp' : 'image/jpeg';
      const pool = await openPool(buffer, poolSize(capabilities, buffer.byteLength), {
        encodeType,
      });
      if (gen !== generation) {
        // A newer file was chosen while this one opened; discard the stale pool.
        pool.terminate();
        return;
      }
      session = { pool, file, ext };

      const derived = toComicMetadata(pool.metadata ?? {}, {
        fallbackTitle: stripPdfExtension(file.name),
      });
      form.show(mergePrefill(derived, loadLastUsed()));
      setStatus(elements.status, '');
      setStatus(
        elements.warning,
        inputWarning({
          fileSizeBytes: file.size,
          pageCount: pool.pageCount,
          streamingDelivery: capabilities.fileSystemAccess,
        }) ?? '',
      );
    } catch (error) {
      if (gen !== generation) {
        return;
      }
      fileInput.disabled = false;
      setStatus(
        elements.status,
        error instanceof Error ? error.message : 'Could not read this PDF.',
      );
    }
  };

  const onFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    if (!isPdf(file)) {
      setStatus(elements.status, 'Choose a PDF file.');
      return;
    }
    // Abandon any previously opened file before opening the new one.
    generation += 1;
    closeSession();
    void openForm(file);
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

function convert(
  elements: UiElements,
  capabilities: RuntimeCapabilities,
  session: OpenSession,
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
    {
      pool: session.pool,
      file: session.file,
      ext: session.ext,
      fileSystemAccess: capabilities.fileSystemAccess,
    },
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

// The MIME type is empty on some platforms, so fall back to the extension.
function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
