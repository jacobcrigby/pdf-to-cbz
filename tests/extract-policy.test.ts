// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { decideExtract, type ImageDescriptor, type ImageCodec } from '../src/core/extract-policy';

// A descriptor for an ideal pass-through JPEG; each test overrides only what it probes.
function descriptor(overrides: Partial<ImageDescriptor> = {}): ImageDescriptor {
  return {
    codec: 'jpeg',
    singleFilter: true,
    colorspace: 'rgb',
    bitsPerComponent: 8,
    hasSoftMask: false,
    hasColorKeyMask: false,
    isImageMask: false,
    invertedDecode: false,
    upright: true,
    pageRotation: 0,
    ...overrides,
  };
}

describe('decideExtract', () => {
  it('passes through a plain RGB JPEG', () => {
    expect(decideExtract(descriptor())).toBe('passthrough');
  });

  it('passes through a grayscale JPEG', () => {
    expect(decideExtract(descriptor({ colorspace: 'gray' }))).toBe('passthrough');
  });

  it('renders a CMYK JPEG rather than emitting bytes a reader would misread', () => {
    expect(decideExtract(descriptor({ colorspace: 'cmyk' }))).toBe('render');
  });

  it('renders an indexed JPEG', () => {
    expect(decideExtract(descriptor({ colorspace: 'indexed' }))).toBe('render');
  });

  it('renders a JPEG with a soft mask (transparency a bare JPEG cannot carry)', () => {
    expect(decideExtract(descriptor({ hasSoftMask: true }))).toBe('render');
  });

  it('renders a JPEG with a color-key mask', () => {
    expect(decideExtract(descriptor({ hasColorKeyMask: true }))).toBe('render');
  });

  it('renders a JPEG with an inverting decode array', () => {
    expect(decideExtract(descriptor({ invertedDecode: true }))).toBe('render');
  });

  it('renders a JPEG behind a filter chain (raw bytes are not the JPEG)', () => {
    expect(decideExtract(descriptor({ singleFilter: false }))).toBe('render');
  });

  it('renders a JPEG that is not 8 bits per component', () => {
    expect(decideExtract(descriptor({ bitsPerComponent: 16 }))).toBe('render');
  });

  it('renders a rotated or flipped JPEG placement', () => {
    expect(decideExtract(descriptor({ upright: false }))).toBe('render');
  });

  it('renders a JPEG on a page with a non-zero rotation', () => {
    expect(decideExtract(descriptor({ pageRotation: 90 }))).toBe('render');
  });

  it.each<ImageCodec>(['flate', 'lzw', 'runlength', 'ccitt', 'jbig2', 'raw'])(
    'losslessly re-encodes a %s source to PNG',
    (codec) => {
      expect(decideExtract(descriptor({ codec }))).toBe('lossless');
    },
  );

  it('renders a lossy JPEG 2000 source (PNG would only bloat it)', () => {
    expect(decideExtract(descriptor({ codec: 'jpeg2000' }))).toBe('render');
  });

  it('renders an unknown codec', () => {
    expect(decideExtract(descriptor({ codec: 'other' }))).toBe('render');
  });

  it('does not pass through a lossless source even when otherwise ideal', () => {
    // A lossless codec is never byte-identical-JPEG, so it takes the PNG path, not passthrough.
    expect(decideExtract(descriptor({ codec: 'flate' }))).toBe('lossless');
  });
});
