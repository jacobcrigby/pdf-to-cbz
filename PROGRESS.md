<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# PROGRESS

Single source of truth for **current state of work**, updated and committed with every
change so any agent can resume from the repo alone. See `docs/plan/implementation.md` for
the full plan and `docs/spec/pdf-to-cbz-v1.md` for the contract.

**Active branch:** `main` (committing directly through v1)
**Current phase:** Phase 5 — Capability-sized pool

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
- [ ] Pre-conversion form (spec §5.4), pre-filled + locally persisted

### Phase 7 — UX hardening
- [ ] Progress, cancel, warn-and-continue summary, encrypted/corrupt handling, size warning

### Phase 8 — Fast-follow (separate sign-off)
- [ ] PWA (manifest + service worker) on the Pages hosting from Phase 1
