// SPDX-License-Identifier: AGPL-3.0-or-later

// pdf.js signals its failure modes through the `name` of the thrown error
// (PasswordException, InvalidPDFException, …). Map the ones a user can act on to
// a clear message; everything else falls back to the error text, then a generic line.

/** Turn a pdf.js (or other) open/render error into a user-facing explanation. */
export function describePdfError(error: unknown, fallback = 'Could not read this PDF.'): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'PasswordException':
      return 'This PDF is password-protected, which is not supported yet.';
    case 'InvalidPDFException':
      return 'This file is not a valid PDF, or it is damaged.';
    case 'MissingPDFException':
      return 'The PDF could not be read — it may be empty or incomplete.';
    default:
      return error instanceof Error && error.message ? error.message : fallback;
  }
}
