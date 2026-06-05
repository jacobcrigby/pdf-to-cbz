// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate the PWA icon set from a single vector-ish drawing, with no image
// dependency: pixels are composited into an RGBA buffer and encoded to PNG via
// Node's built-in zlib. Re-run with `node scripts/generate-icons.mjs` if the mark
// changes. Output lands in `public/` so Vite copies it verbatim into the build.
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [67, 56, 202]; // indigo #4338CA
const PAGE = [255, 255, 255];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Draw the mark: an indigo field, a white page, and an indigo down-arrow on the
// page (PDF → file). The content sits inside the central safe zone so the same
// drawing doubles as a maskable icon.
function draw(n) {
  const px = Buffer.alloc(n * n * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    const i = (y * n + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };

  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) set(x, y, BG);

  const pad = 0.26 * n;
  const lo = pad;
  const hi = n - pad;
  const radius = 0.06 * n;
  const inPage = (x, y) => {
    if (x < lo || x > hi || y < lo || y > hi) return false;
    const cx = Math.min(Math.max(x, lo + radius), hi - radius);
    const cy = Math.min(Math.max(y, lo + radius), hi - radius);
    return Math.hypot(x - cx, y - cy) <= radius;
  };

  const cx = 0.5 * n;
  const shaftHalf = 0.04 * n;
  const shaftTop = 0.36 * n;
  const shaftBottom = 0.55 * n;
  const headTop = 0.53 * n;
  const headBottom = 0.66 * n;
  const headHalf = 0.1 * n;
  const inArrow = (x, y) => {
    if (y >= shaftTop && y <= shaftBottom && Math.abs(x - cx) <= shaftHalf) return true;
    if (y >= headTop && y <= headBottom) {
      const t = (y - headTop) / (headBottom - headTop);
      return Math.abs(x - cx) <= headHalf * (1 - t);
    }
    return false;
  };

  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!inPage(x, y)) continue;
      set(x, y, inArrow(x, y) ? BG : PAGE);
    }
  }
  return encodePng(n, n, px);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'pwa-192x192.png'), draw(192));
writeFileSync(join(OUT, 'pwa-512x512.png'), draw(512));
writeFileSync(join(OUT, 'pwa-maskable-512x512.png'), draw(512));
writeFileSync(join(OUT, 'apple-touch-icon.png'), draw(180));

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#4338ca"/>
  <rect x="17" y="14" width="30" height="36" rx="4" fill="#fff"/>
  <path d="M32 23v13m0 6 7-9m-7 9-7-9" fill="none" stroke="#4338ca" stroke-width="4"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(join(OUT, 'favicon.svg'), favicon);

console.log('Wrote PWA icons to public/');
