<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# PROGRESS

Single source of truth for **current state of work**, updated and committed with every
change so any agent can resume from the repo alone. See `docs/plan/implementation.md` for
the full plan and `docs/spec/pdf-to-cbz-v1.md` for the contract.

**Active branch:** `main` (committing directly through v1)
**Current phase:** Phase 7 — UX hardening (complete); Phase 8 (PWA) next

## How to resume
1. Read `AGENTS.md`, then this file, then `docs/spec/pdf-to-cbz-v1.md`.
2. `git log --oneline` for the latest checkpoint; pick up the first unchecked item below.
3. Build/test with the `npm` scripts (added in Phase 1).

## Phase checklist

### Phase 0 — Spec, plan & handoff setup  (complete)
- [x] Write `docs/spec/pdf-to-cbz-v1.md`
- [x] Mirror plan to `docs/plan/implementation.md`
- [x] Create `PROGRESS.md`
- [x] Reconcile `AGENTS.md` §8 + add "Resuming work / handoff" section
- [x] Add D8 block + "decisions locked" banner to `docs/planning/architecture-decisions.html`
- [x] Adopt `docs/conventions/clean-documentation.md` + require it for all agents in `AGENTS.md`
- [x] Squash-merge to `main` + push

### Phase 1 — Scaffold + deploy runner
- [x] Vite + TS strict, `index.html`, minimal UI shell, SPDX headers
- [x] `runtime-capabilities.ts` stub + unit tests
- [x] `npm` scripts: `dev` / `build` / `preview` / `test`
- [x] ESLint + Prettier config
- [x] GitHub Actions CI + GitHub Pages deploy workflows
  - One-time manual step: repo Settings > Pages > Source = "GitHub Actions"

### Phase 2 — Render path end-to-end
- [x] Bundled pdf.js in `convert.worker`; render-all → fflate zip → download
  - Worker + OffscreenCanvas only; main-thread `<canvas>` fallback deferred (see decisions)
  - Render constants build-time configurable via `VITE_*` env (see `.env.example`)
  - Pure modules `core/scale.ts` + `core/naming.ts` unit-tested; render/worker path is manual e2e
  - Verified: real PDF converts and renders correctly with zero network

### Phase 3 — Naming, ordering, metadata
- [x] `pdf-metadata.ts`, `comicinfo.ts`; ComicInfo.xml at root + page-0 FrontCover
  - PDF-derived only (Title/Writer/Summary/Year-Month-Day/LanguageISO/PageCount/Notes); user
    override form is Phase 6
  - Worker numbers written pages contiguously so skips leave no gap; `naming.ts` unchanged
  - Pending: manual e2e — inspect `ComicInfo.xml` in the `.cbz` and confirm cover/metadata in a reader

### Phase 4 — Hybrid (pragmatic)
- [x] `page-classifier` + page `analyze()`: single full-page image pages render at native
      resolution; mixed pages use the ~1600px target
  - True JPEG byte-passthrough deferred — pdf.js doesn't expose original image bytes
    (see spec §3.2 v1 note); native-res cap is `VITE_NATIVE_MAX_LONG_EDGE_PX` (default 4000)
  - Pending: manual e2e — confirm a scanned/image PDF comes out sharper than the 1600px cap

### Phase 5 — Capability-sized pool
- [x] `worker/render.worker.ts` (renders one page on request) + `worker/pool.ts` (drives N
      workers); zip + ComicInfo + download moved to the controller (main thread)
- [x] `core/page-scheduler.ts` (pure, tested): reorder-window backpressure + ordered emission
- [x] `core/pool-size.ts` (pure, tested): pool size from cores/memory, clamped `[1, POOL_MAX=4]`
- Each worker holds its own PDF copy (no SharedArrayBuffer on a static host); pool size gates
  on `deviceMemory` to bound peak memory
- Delivery: File System Access streaming when available (prompts save up front, streams the
  archive to disk so it is never held in RAM), else Blob+anchor. Compression stays STORE
  (adaptive DEFLATE deferred).
- Memory discipline: `page.cleanup()` after each render (pdf.js caches grow otherwise);
  pool budget 4 GiB/worker (`deviceMemory` over-reports a mobile tab's real limit); native-res
  cap defaults to 2600px. Tune via `VITE_NATIVE_MAX_LONG_EDGE_PX` if needed.
- `poolSize` also shrinks for a large PDF (each worker holds its own copy; total copies bounded
  by a 256 MiB budget) — verified working on Android (Pixel 9 Pro XL).

### Future — per-worker PDF slicing (planned, not started)
Each render worker copies the whole PDF (no SharedArrayBuffer on a static host). A later phase
can split the source into N sub-PDFs (via `pdf-lib`) so each worker loads only its page range,
cutting steady-state memory for very large PDFs. Tradeoffs to weigh then: ~300 KB dependency,
an up-front main-thread parse/spike, double-parsing, and static partitioning (load imbalance)
replacing the current dynamic work-stealing scheduler.

### Phase 6 — Metadata entry & overrides
- [x] Pre-conversion form (spec §5.4 fields), pre-filled + locally persisted
  - Selecting a PDF reads its metadata (throwaway worker), then shows the form pre-filled
    (PDF-derived wins, else last-used from localStorage); Convert click drives conversion and
    is the user gesture for the FSA save picker
  - `ComicMetadata` expanded to all §5.4 fields; `core/comicinfo.ts` emits them in xsd order;
    persisted carry-over fields exclude per-issue ones (title/number/dates/summary)
  - Pure helpers (`mergePrefill`/`persistableFields`/save+load) unit-tested; form render
    smoke-tested in a real browser (23 fields, hidden until a PDF is chosen)

### Phase 7 — UX hardening
- [x] Progress, cancel, warn-and-continue summary, encrypted/corrupt handling, size warning
  - Progress: `<progress>` bar driven by the pool's `onProgress` (page X of N) alongside the
    status text
  - Cancel: a Cancel button during conversion aborts via an `AbortSignal` threaded
    controller → `pool.run`; the scheduler stops dispatch and rejects `AbortError`, the
    controller aborts the FSA writable so no partial file is left, and the UI resets to idle.
    Dismissing the FSA save dialog is treated as the same cancel
  - Encrypted/corrupt: pure `core/pdf-errors.ts` maps pdf.js error names
    (Password/Invalid/Missing PDF exceptions) to clear messages; the worker's open path uses
    it, so both the metadata read and the render pool surface the explanation (FR-3, §8)
  - Warn-and-continue summary: skipped page numbers collected and shown at the end (lists
    them when few, else just the count) (FR-14)
  - Size warning: pure `core/input-warning.ts` shows a soft, non-blocking heads-up for a large
    file / high page count, with an extra memory caution when delivery isn't streamed to disk;
    `readPdfMetadata` now also returns the page count to feed it
  - Pure helpers unit-tested; cancel/progress/warning wiring is manual e2e

### Phase 8 — Fast-follow (separate sign-off)
- [ ] PWA (manifest + service worker) on the Pages hosting from Phase 1
