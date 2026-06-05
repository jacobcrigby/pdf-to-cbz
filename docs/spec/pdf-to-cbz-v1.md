<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# pdf-to-cbz — v1 Specification

**Status:** authoritative source of truth (Spec-Driven Development).
**Last updated:** 2026-06-03.

This document is the contract the implementation must satisfy. The implementation plan
(`docs/plan/implementation.md`) and `PROGRESS.md` derive from it. **Any change to a
decision updates this spec first**, then the plan, then code. Rationale for the choices
lives in `AGENTS.md` §8 and the locked-decisions table in `docs/plan/implementation.md`.

---

## 1. Purpose & scope

Convert a single PDF (typically a zine) into a **CBZ** comic archive **entirely in the
browser** — no server, no upload — for use in reader apps. Deployed as a static site on
GitHub Pages and installable as an offline PWA.

**In scope (v1):** one PDF at a time; hybrid extract-or-render conversion; WebP-encoded
rendered pages; `ComicInfo.xml` metadata including a designated cover; a pre-conversion
form to supply/override metadata; adaptive behavior based on measured runtime capability.

**Out of scope (v1):** multi-file batch/queue; advanced per-page output controls (format,
quality, DPI, page range) beyond the single quality default; server features of any kind.

---

## 2. Definitions

- **CBZ** — a ZIP archive whose entries are page images, ordered by filename, optionally
  with a `ComicInfo.xml` metadata file at the archive root.
- **Extract** — recover a page's original encoded image bytes from the PDF without
  re-encoding (lossless).
- **Render** — rasterize a PDF page to a bitmap via pdf.js, then encode it to an image.
- **Runtime capability** — the feature set and resource hints measured in the current
  browser at load time (see §7).

---

## 3. Functional requirements

### 3.1 Input
- **FR-1** Accept exactly one PDF via file picker or drag-and-drop.
- **FR-2** Read the file fully client-side; never transmit it anywhere (verifiable: no
  network requests during conversion).
- **FR-3** Reject non-PDF input with a clear message. Detect encrypted/password-protected
  PDFs and either prompt for a password (if feasible) or fail cleanly with explanation.

### 3.2 Conversion (hybrid engine)
- **FR-4** For each page, decide **extract** vs **render**:
  - **Extract** when the page consists of a single full-page image whose original bytes
    are cleanly recoverable — in v1 this means **JPEG/DCTDecode passthrough**.
  - **Render** otherwise (vector/text pages, multi-image pages, or non-JPEG codecs whose
    safe extraction isn't guaranteed).
- **FR-5** Rendered pages are encoded to **WebP**, with **JPEG fallback** when WebP
  encoding is unavailable in the runtime. Extracted pages keep their original bytes and
  file extension.
- **FR-6** Default render resolution targets **~1600px on the long edge** (see §6 for the
  scale formula). This is a v1 constant; advanced controls are out of scope.
- **FR-7** Pages appear in the archive in source page order (§5.1).

> **v1 implementation note (hybrid):** pdf.js does not expose a page image's original
> encoded bytes through its public API, so true DCTDecode byte-passthrough (FR-4 *extract*)
> is **deferred**. Instead, a page detected as a single full-page image is **rendered at the
> image's native resolution** (bypassing the ~1600px target of FR-6, bounded by a configurable
> cap) so scans stay sharp; all pages are still encoded per FR-5. Byte-identical passthrough
> can be revisited later via independent PDF stream parsing.

### 3.3 Archive & metadata
- **FR-8** Output is a single `.cbz` (ZIP). Compression per §7.3 (adaptive light DEFLATE
  or STORE). The output filename derives from the source name, sanitized (§5.2).
- **FR-9** Write `ComicInfo.xml` at the archive root (§5.3), populated from PDF-derived
  metadata merged with user-supplied values (§3.4). Mark the **first page as the cover**
  via a `<Pages>` entry with `Image="0"` and `Type="FrontCover"`.

### 3.4 User-supplied metadata
- **FR-10** Before conversion, present a form **pre-filled** from PDF-derived metadata,
  letting the user add or override the editable fields in §5.4. User values win over
  PDF-derived values. Fields left blank are omitted from `ComicInfo.xml` (no empty tags).
- **FR-11** Persist the last-used values locally (e.g. `localStorage`) so they pre-fill
  next time. No network, no cross-device sync.

### 3.5 Output delivery & feedback
- **FR-12** Deliver the archive via **File System Access** streaming when available, else
  a **Blob + anchor download** (§7.4).
- **FR-13** Show conversion progress (page X of N) and allow **cancel**; cancelling frees
  buffers and produces no partial download.
- **FR-14** On a page that cannot be decoded/encoded, **warn and continue** (skip the page,
  record a warning) and present a summary at the end; never crash silently.

---

## 4. Non-functional requirements

- **NFR-1 Privacy/offline:** zero network requests after the app's assets load; no
  telemetry. Installable, offline-capable PWA (PWA itself is a fast-follow phase).
- **NFR-2 Memory safety:** peak memory stays bounded regardless of page count via
  backpressure and streaming (§7.1–7.2); the app must not OOM on a low-capability device
  for a reasonably large zine.
- **NFR-3 Targets:** current desktop Chrome/Edge/Firefox/Safari and Mobile Chrome are
  required; Mobile Safari is best-effort. Behavior is gated by **measured runtime
  capability (§7)**, not by a hard-coded device class.
- **NFR-4 Licensing:** AGPL-3.0-or-later; every source file carries the SPDX header.
- **NFR-5 Maintainability/testability:** pure logic isolated from DOM/worker glue and unit
  tested; TypeScript strict.
- **NFR-6 Portability/handoff:** all authoritative artifacts live in the repo as plain
  markdown; build/test/run via standard `npm` scripts; resumable by any agent at any
  commit (see the plan's handoff section).
- **NFR-7 Simple & event-driven:** keep the architecture as simple as the problem allows
  (YAGNI; no speculative abstraction). Components communicate through **events/messages** —
  DOM events in the UI, `postMessage` between the main thread and workers, and an
  event/callback stream for progress, page-completion, warnings, and done — rather than
  polling or shared mutable state. The controller is a small state machine reacting to
  those events; backpressure flows through acknowledgements, not busy-waiting.

---

## 5. Data formats

### 5.1 Page naming
- Entries named `NNNN.<ext>`, zero-padded to a width of `max(4, digits(pageCount))`,
  starting at `0001`. Numeric order equals reading order (preserves RTL when the source
  page order is RTL).
- `<ext>` is `webp`/`jpg` for rendered pages, or the original extension for extracted
  pages (e.g. `jpg`).

### 5.2 Output filename
- Derive from the source filename minus its `.pdf` extension; sanitize by removing path
  separators and characters illegal on common filesystems (`/ \ : * ? " < > |`),
  collapsing whitespace, trimming, and falling back to `comic` if empty. Append `.cbz`.

### 5.3 ComicInfo.xml
- UTF-8 XML, root element `<ComicInfo>` (ComicInfo schema; Anansi Project). All values
  XML-escaped. Empty/unknown fields are omitted. A `<Pages>` element lists `<Page>`
  entries; at minimum page 0 is `<Page Image="0" Type="FrontCover" />`. `PageCount`
  reflects the number of image entries written.
- **PDF-derived mapping:** `Title`←PDF title (fallback: sanitized source filename);
  `Writer`←PDF Author; `Summary`←PDF Subject; `Year`/`Month`/`Day`←PDF CreationDate;
  `LanguageISO`←PDF `/Lang`; `PageCount`←written page count; `Notes`←a provenance string
  (e.g. "Converted from PDF by pdf-to-cbz").

### 5.4 Editable metadata fields (form)
Series, Number, Volume, Count, Title, Summary, Writer, Penciller, Inker, Colorist,
Letterer, CoverArtist, Editor, Publisher, Genre, Tags, Web, LanguageISO, AgeRating, and
reading direction (`Manga` = `No`/`Yes`/`YesAndRightToLeft`). PDF-derived values pre-fill
where available; user input overrides.

---

## 6. Render scale

For a page with PDF point dimensions `w×h` (1 pt = 1/72"), choose
`scale = TARGET_LONG_EDGE_PX / max(w, h)`, clamped to `[1.0, MAX_SCALE]`, with
`TARGET_LONG_EDGE_PX = 1600`. Render the page at that scale to an OffscreenCanvas
(or main-thread canvas fallback) and encode per §3.2. Pages with transparency are
flattened onto a white background.

---

## 7. Runtime-capability model

A single module probes capability at load and yields a `Capabilities` object that drives
all adaptive behavior. **No mobile/desktop branching** — only measured capability.

### 7.1 Probes
- **Features:** `OffscreenCanvas`, WebP encode support (test `convertToBlob`/`toDataURL`
  output type once), File System Access (`window.showSaveFilePicker`), module workers.
- **Resources:** `navigator.hardwareConcurrency`, `navigator.deviceMemory` (both optional;
  use conservative defaults when absent).

### 7.2 Worker pool sizing & backpressure
- Pool size derives from cores/memory, clamped to `[1, POOL_MAX]` with `POOL_MAX = 4`.
  On low signals it converges to 1. Backpressure caps **in-flight (decoded but not-yet-archived) pages** to
  a small bound so peak memory does not grow with page count. Each finished page is
  streamed into the archive and its buffers released immediately.

### 7.3 Compression
- Use **light DEFLATE** (low level) when resource headroom exists; otherwise **STORE**.
  Rationale: WebP/JPEG pages are already compressed, so gains are mostly on `ComicInfo.xml`
  and any uncompressed bytes — the level is kept low to bound CPU.

### 7.4 Delivery & encoder
- **Delivery:** FSA streaming when `showSaveFilePicker` exists (lowest peak memory), else
  Blob + anchor.
- **Encoder/canvas:** OffscreenCanvas when present, else main-thread `<canvas>`.

---

## 8. Error handling & edge cases

- Encrypted/password PDFs: prompt or clean failure (FR-3).
- Corrupt/malformed PDFs: report and abort the job with a clear message; identify the
  failing page where possible.
- Exotic embedded codecs (JBIG2/JPEG2000/CCITT): extraction is not guaranteed → render
  fallback (FR-4).
- CMYK/colorspace & transparency: flatten onto white; rely on pdf.js color handling.
- OffscreenCanvas absent: main-thread canvas fallback (§7.4).
- Per-page decode/encode failure: warn-and-continue (FR-14).
- Cancel mid-conversion: free buffers, no partial file (FR-13).
- Non-FSA path: the full ZIP is held as a Blob before save — a memory ceiling on very
  large outputs; acceptable for v1, mitigated by FSA where available.

---

## 9. Acceptance criteria (v1 "done")

1. Converting an image-based PDF yields a `.cbz` that opens in a comic reader with pages
   in correct order and the first page shown as the cover.
2. Converting a vector/text PDF yields a readable `.cbz` (all pages rendered).
3. A mixed PDF yields image-bytes-preserved pages where extraction applied and rendered
   pages elsewhere — verifiable by inspecting entry formats.
4. `ComicInfo.xml` is present, well-formed, schema-valid for the fields used, reflects
   PDF-derived + user-supplied metadata, and marks page 0 as `FrontCover`.
5. The metadata form pre-fills from the PDF and round-trips user overrides into the output.
6. No network requests occur during conversion (devtools verified).
7. On a low-capability run (forced pool=1, STORE), a large PDF converts without exhausting
   memory; on a high-capability run, parallelism and light compression engage.
8. Cancellation leaves no partial download; a bad page produces a warning, not a crash.
9. `npm run build` is clean and TypeScript strict passes; unit + integration tests green.
10. The GitHub Actions deploy workflow publishes the built site to GitHub Pages, and the
    CI workflow's lint/typecheck/test/build all pass in the runner.

---

## 10. Build & deployment

The app is a static site **built with Vite** to a `dist/` directory and **hosted on GitHub
Pages** — there is no server. It is **not run from a developer's machine in production**, so
the build must succeed in the GitHub Actions runner, not only locally.

- **CI runner.** A GitHub Actions workflow runs `lint`, `typecheck`, `test`, and `build` on
  every pull request and push. A green build in the runner is the gate; "works on my machine"
  is not sufficient.
- **Deploy runner.** A GitHub Actions workflow builds and publishes `dist/` to GitHub Pages
  (Pages source = "GitHub Actions"), on push to `main` and on manual dispatch. This pipeline
  is established **early (Phase 1)**, so every change is continuously deployable from the
  start rather than wiring deployment up at the end.
- **Subpath base.** GitHub Pages serves a project site under `/<repo>/`, so the build uses a
  relative base; asset URLs must not assume the domain root.
- The PWA (manifest + service worker) is a separate fast-follow (Phase 8) layered on top of
  this hosting.
