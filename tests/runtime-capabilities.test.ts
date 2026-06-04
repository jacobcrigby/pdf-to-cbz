// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  deriveCapabilities,
  probeRuntimeCapabilities,
  type CapabilityEnv,
  type RawCapabilities,
} from '../src/core/runtime-capabilities';

const allFeaturesOn = {
  offscreenCanvas: true,
  webpEncode: true,
  fileSystemAccess: true,
  moduleWorkers: true,
} as const;

const allFeaturesOff = {
  offscreenCanvas: false,
  webpEncode: false,
  fileSystemAccess: false,
  moduleWorkers: false,
} as const;

describe('deriveCapabilities', () => {
  it('passes through all features and resources when present', () => {
    const caps = deriveCapabilities({
      ...allFeaturesOn,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    });
    expect(caps).toEqual({
      ...allFeaturesOn,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    });
  });

  it('applies conservative defaults when resources are absent', () => {
    const caps = deriveCapabilities({ ...allFeaturesOff });
    expect(caps.hardwareConcurrency).toBe(1);
    expect(caps.deviceMemory).toBe(1);
    expect(caps.offscreenCanvas).toBe(false);
  });

  it('reports webpEncode false even when OffscreenCanvas is present', () => {
    const caps = deriveCapabilities({
      ...allFeaturesOn,
      webpEncode: false,
    });
    expect(caps.offscreenCanvas).toBe(true);
    expect(caps.webpEncode).toBe(false);
  });

  it('clamps non-positive or invalid concurrency to a floor of 1', () => {
    expect(
      deriveCapabilities({ ...allFeaturesOff, hardwareConcurrency: 0 }).hardwareConcurrency,
    ).toBe(1);
    expect(
      deriveCapabilities({ ...allFeaturesOff, hardwareConcurrency: -4 }).hardwareConcurrency,
    ).toBe(1);
    expect(
      deriveCapabilities({ ...allFeaturesOff, hardwareConcurrency: NaN }).hardwareConcurrency,
    ).toBe(1);
  });

  it('floors fractional concurrency to whole cores', () => {
    expect(
      deriveCapabilities({ ...allFeaturesOff, hardwareConcurrency: 4.9 }).hardwareConcurrency,
    ).toBe(4);
  });

  it('defaults non-positive device memory but passes through valid values', () => {
    expect(deriveCapabilities({ ...allFeaturesOff, deviceMemory: 0 }).deviceMemory).toBe(1);
    expect(deriveCapabilities({ ...allFeaturesOff, deviceMemory: 4 }).deviceMemory).toBe(4);
  });

  it('produces a record with exactly the capability keys and no derived policy', () => {
    const caps = deriveCapabilities({ ...allFeaturesOn, hardwareConcurrency: 2, deviceMemory: 2 });
    expect(Object.keys(caps).sort()).toEqual(
      [
        'deviceMemory',
        'fileSystemAccess',
        'hardwareConcurrency',
        'moduleWorkers',
        'offscreenCanvas',
        'webpEncode',
      ].sort(),
    );
  });
});

describe('probeRuntimeCapabilities', () => {
  function env(overrides: Partial<CapabilityEnv> = {}): CapabilityEnv {
    return { ...allFeaturesOff, hardwareConcurrency: 4, deviceMemory: 4, ...overrides };
  }

  it('reflects the injected environment', () => {
    const caps = probeRuntimeCapabilities(env({ ...allFeaturesOn }));
    expect(caps.offscreenCanvas).toBe(true);
    expect(caps.webpEncode).toBe(true);
    expect(caps.fileSystemAccess).toBe(true);
    expect(caps.moduleWorkers).toBe(true);
    expect(caps.hardwareConcurrency).toBe(4);
  });

  it('isolates the File System Access feature flag', () => {
    expect(probeRuntimeCapabilities(env({ fileSystemAccess: true })).fileSystemAccess).toBe(true);
    expect(probeRuntimeCapabilities(env({ fileSystemAccess: false })).fileSystemAccess).toBe(false);
  });

  it('isolates the module-worker feature flag', () => {
    expect(probeRuntimeCapabilities(env({ moduleWorkers: true })).moduleWorkers).toBe(true);
    expect(probeRuntimeCapabilities(env({ moduleWorkers: false })).moduleWorkers).toBe(false);
  });

  it('falls back to defaults when the environment omits resource hints', () => {
    const raw: RawCapabilities = { ...allFeaturesOff };
    const caps = probeRuntimeCapabilities(raw);
    expect(caps.hardwareConcurrency).toBe(1);
    expect(caps.deviceMemory).toBe(1);
  });
});
