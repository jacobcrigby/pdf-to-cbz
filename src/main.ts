// SPDX-License-Identifier: AGPL-3.0-or-later
import { getElements } from './ui/dom';
import { initApp } from './ui/app';
import { probeRuntimeCapabilities } from './core/runtime-capabilities';

// Probe once at startup to confirm capability detection runs in a real browser;
// the conversion pipeline that consumes it arrives in later phases.
probeRuntimeCapabilities();

initApp(getElements());
