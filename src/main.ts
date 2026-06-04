// SPDX-License-Identifier: AGPL-3.0-or-later
import { getElements } from './ui/dom';
import { initApp } from './ui/app';
import { probeRuntimeCapabilities } from './core/runtime-capabilities';

initApp(getElements(), probeRuntimeCapabilities());
