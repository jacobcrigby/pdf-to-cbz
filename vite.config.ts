// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';

// GitHub Pages serves a project site under `/<repo>/`, so a relative base keeps
// asset URLs working without hard-coding the deployment path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
