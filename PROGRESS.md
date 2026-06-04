<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# PROGRESS

Single source of truth for **current state of work**, updated and committed with every
change so any agent can resume from the repo alone. See `docs/plan/implementation.md` for
the full plan and `docs/spec/pdf-to-cbz-v1.md` for the contract.

**Active branch:** `claude/festive-clarke-8Jl4K`
**Current phase:** Phase 2 — Render path end-to-end

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
  - Pending: manual e2e — convert a real PDF, open the `.cbz` in a reader, confirm zero network

### Phase 3 — Naming, ordering, metadata
- [ ] `naming.ts`, `pdf-metadata.ts`, `comicinfo.ts`; ComicInfo.xml + page-0 FrontCover

### Phase 4 — Hybrid extraction
- [ ] `analyzePage` / `page-classifier` / `extractImageBytes` (JPEG) + render fallback

### Phase 5 — Capability-sized pool + compression
- [ ] `worker/pool.ts`, `render.worker.ts`, backpressure, ordered completion
- [ ] adaptive level / pool size / delivery wired from `runtime-capabilities.ts`

### Phase 6 — Metadata entry & overrides
- [ ] Pre-conversion form (spec §5.4), pre-filled + locally persisted

### Phase 7 — UX hardening
- [ ] Progress, cancel, warn-and-continue summary, encrypted/corrupt handling, size warning

### Phase 8 — Fast-follow (separate sign-off)
- [ ] PWA (manifest + service worker) on the Pages hosting from Phase 1
