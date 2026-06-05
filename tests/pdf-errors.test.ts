// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { describePdfError } from '../src/core/pdf-errors';

function named(name: string, message = ''): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('describePdfError', () => {
  it('explains a password-protected PDF', () => {
    expect(describePdfError(named('PasswordException', 'No password'))).toMatch(
      /password-protected/i,
    );
  });

  it('explains an invalid or damaged PDF', () => {
    expect(describePdfError(named('InvalidPDFException'))).toMatch(/not a valid PDF/i);
  });

  it('explains a missing/incomplete PDF', () => {
    expect(describePdfError(named('MissingPDFException'))).toMatch(/empty or incomplete/i);
  });

  it('passes through an unknown error message', () => {
    expect(describePdfError(named('SomethingElse', 'boom'))).toBe('boom');
  });

  it('falls back when there is no message', () => {
    expect(describePdfError(named('SomethingElse'))).toBe('Could not read this PDF.');
    expect(describePdfError('not an error', 'custom')).toBe('custom');
  });
});
