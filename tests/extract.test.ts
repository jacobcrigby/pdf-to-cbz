// SPDX-License-Identifier: AGPL-3.0-or-later
import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { decideExtract } from '../src/core/extract-policy';
import { createImageExtractor } from '../src/pdf/extract';

// A real 6×9 baseline RGB JPEG (with an embedded ICC profile), base64-encoded so the
// test is self-contained. pdf-lib stores these exact bytes as the image stream, which
// is what the extract path must hand back untouched for true byte passthrough.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAJAAYDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUG/8QAIhAAAQMDAwUAAAAAAAAAAAAAAQADBQIEEgYRFBUhIjFR/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/xAAeEQEAAgICAwEAAAAAAAAAAAABAhEDIQQSACJhQf/aAAwDAQACEQMRAD8Aw8pa6Ya07CXMVI3D0w/yeq29dJDbGLgDOBxG+VG5PlV3+ekUdFSvC4rw8bjlklO5TlckU7zlIiUHrC+kCrIRiKtqU5shll2IkdBr4Bf7tq36tUa8/9k=';

function jpegBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(JPEG_BASE64, 'base64'));
}

// Build a single-page PDF whose page is exactly the embedded JPEG, optionally rotated.
async function pdfWithJpegPage(rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(jpegBytes());
  const page = doc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  if (rotation !== 0) {
    page.setRotation(degrees(rotation));
  }
  return doc.save();
}

describe('createImageExtractor', () => {
  it('recovers a single full-page JPEG byte-for-byte', async () => {
    const extractor = await createImageExtractor(await pdfWithJpegPage());
    const found = extractor.find(0, 6, 9, true);
    expect(found).toBeDefined();
    expect(found?.descriptor.codec).toBe('jpeg');
    expect(found?.descriptor.colorspace).toBe('rgb');
    expect(found?.descriptor.singleFilter).toBe(true);
    expect(found?.rawBytes).toEqual(jpegBytes());
  });

  it('produces a descriptor a JPEG page passes through on', async () => {
    const extractor = await createImageExtractor(await pdfWithJpegPage());
    const found = extractor.find(0, 6, 9, true);
    expect(found && decideExtract(found.descriptor)).toBe('passthrough');
  });

  it('reports page rotation so a rotated JPEG is not passed through', async () => {
    const extractor = await createImageExtractor(await pdfWithJpegPage(90));
    const found = extractor.find(0, 6, 9, true);
    expect(found?.descriptor.pageRotation).toBe(90);
    expect(found && decideExtract(found.descriptor)).toBe('render');
  });

  it('returns nothing for a page with no images', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const extractor = await createImageExtractor(await doc.save());
    expect(extractor.find(0, 6, 9, true)).toBeUndefined();
  });
});
