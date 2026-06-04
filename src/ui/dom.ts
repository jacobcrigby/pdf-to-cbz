// SPDX-License-Identifier: AGPL-3.0-or-later

/** The static elements the UI shell binds behavior to. */
export interface UiElements {
  readonly dropzone: HTMLElement;
  readonly fileInput: HTMLInputElement;
  readonly status: HTMLElement;
  readonly metadata: HTMLElement;
}

/** Resolve the shell's elements, failing fast if the markup is missing one. */
export function getElements(root: Document = document): UiElements {
  return {
    dropzone: require(root, '#dropzone', HTMLElement),
    fileInput: require(root, '#file-input', HTMLInputElement),
    status: require(root, '#status', HTMLElement),
    metadata: require(root, '#metadata', HTMLElement),
  };
}

export function setStatus(status: HTMLElement, text: string): void {
  status.textContent = text;
}

function require<T extends HTMLElement>(root: Document, selector: string, type: new () => T): T {
  const el = root.querySelector(selector);
  if (!(el instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return el;
}
