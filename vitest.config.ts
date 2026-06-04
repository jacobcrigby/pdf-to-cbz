// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
