<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# pdf-to-cbz — v1 Implementation Plan

**Canonical, in-repo implementation plan.** Derives from the spec
(`docs/spec/pdf-to-cbz-v1.md`); current status lives in `PROGRESS.md`. Written to be
executed by **any** coding agent — see "Cross-agent handoff" below.

## Locked decisions (D1–D8)

|     | Decision          | Choice                                                                     |
| --- | ----------------- | -------------------------------------------------------------------------- |
| D1  | Conversion engine | Hybrid — extract original bytes for single-image (JPEG) pages, else render |
| D2  | UI stack          | Vanilla TS + Vite (no framework)                                           |
| D3  | ZIP               | fflate, streaming; adaptive light DEFLATE when affordable, else STORE      |
| D4  | Concurrency       | Bounded worker pool, sized from measured runtime capability                |
| D5  | Delivery          | Blob + anchor baseline; File System Access streaming when present          |
| D6  | Rendered format   | WebP (+ JPEG fallback); extracted pages keep original bytes                |
| D7  | pdf.js            | Bundled first-party (no CDN)                                               |
| D8  | Metadata          | ComicInfo.xml at zip root; page 0 = FrontCover; user-editable fields       |

Rationale for each choice is captured inline in `AGENTS.md` §8.

## Module layout

```
src/
  main.ts                 # bootstrap: wire UI → controller
  ui/{app,dom}.ts         # vanilla TS shell: drop/select, metadata form, progress, download
  controller.ts           # orchestrates a job; talks to the worker
  core/                   # PURE (no DOM/worker) — unit tested
    types.ts  runtime-capabilities.ts  naming.ts  pdf-metadata.ts
    comicinfo.ts  page-classifier.ts  scale.ts  extract-policy.ts
  pdf/pdfjs.ts            # bundled pdf.js: loadDocument, getDocMetadata, analyzePage,
                          #   renderPageBitmap
  pdf/extract.ts          # pdf-lib structure parse: recover a page image's original bytes
  zip/cbz.ts             # fflate streaming Zip (ZipPassThrough=STORE / ZipDeflate=light)
  worker/{convert.worker,render.worker,pool}.ts
tests/                    # vitest unit tests for core/*
```

## Conversion flow (one PDF)

UI reads the `File` → posts `ArrayBuffer` (transferable) to `convert.worker` →
probe capabilities → load pdf.js doc + metadata → plan each page (extract vs render) →
capability-sized pool renders/encodes to WebP (JPEG fallback) while extract pages pass
through → ordered pages stream into the fflate zip → append `ComicInfo.xml` (page 0 =
FrontCover) → finalize → FSA stream or Blob+anchor download. Progress + per-page warnings
stream back throughout. See spec §3 and §7.

## Build phases (each gated by sign-off; one squash commit per phase on `main`)

- **Phase 0 — Spec, plan & handoff setup.** This spec/plan/`PROGRESS.md`; reconcile
  `AGENTS.md` + planning HTML; establish git + handoff conventions. _(in progress)_
- **Phase 1 — Scaffold + deploy runner.** Vite + TS strict, `index.html`, minimal UI shell,
  SPDX headers, `runtime-capabilities.ts` stub + tests, `npm` scripts, ESLint + Prettier, and
  the **GitHub Actions CI + GitHub Pages deploy** workflows (build runs in the runner;
  established early so every change is continuously deployable).
- **Phase 2 — Render path end-to-end.** Bundled pdf.js; render every page to WebP → zip →
  download. First working CBZ.
- **Phase 3 — Naming, ordering, metadata.** `naming.ts`, `comicinfo.ts`, `pdf-metadata.ts`;
  ComicInfo.xml with page-0 FrontCover.
- **Phase 4 — Hybrid (pragmatic).** `page-classifier` + page `analyze()` detect single
  full-page image pages and render them at native resolution; mixed pages use the ~1600px
  target.
- **Phase 9 — Extract path (true passthrough).** `pdf/extract.ts` parses the PDF with
  `pdf-lib` to recover a single-image page's original image XObject; `core/extract-policy.ts`
  (pure, tested) decides passthrough (copy DCTDecode bytes → `.jpg`) vs lossless render
  (lossless source → native-resolution PNG) vs render (everything else). The render worker
  keeps a second copy of the source bytes for the parse; `pool-size.ts` counts two copies
  per worker. Per-page extension threads worker → pool → controller → `naming.ts`.
- **Phase 5 — Capability-sized pool.** `render.worker.ts` (renders one page on request) +
  `worker/pool.ts` driving N workers, sized by `core/pool-size.ts` (from cores/memory and the
  PDF size, since each worker copies the PDF — no SharedArrayBuffer on a static host);
  `core/page-scheduler.ts` gives reorder-window backpressure + ordered completion.
  Zip/ComicInfo/download run on the controller, with File System Access streaming delivery when
  available (else Blob+anchor). `page.cleanup()` bounds per-page memory. Adaptive DEFLATE
  deferred (STORE).
- **Phase 5b — Per-worker PDF slicing (planned).** Split the source into N sub-PDFs with
  `pdf-lib` so each worker loads only its page range, cutting steady-state memory for very large
  PDFs. Weigh: dependency size, up-front main-thread parse/spike, double-parse, and static
  partitioning vs the current dynamic scheduler.
- **Phase 6 — Metadata entry & overrides.** Selecting a PDF opens the render pool
  (`openPool`), which reads the document metadata from worker 0 along the way, and shows
  `ui/metadata-form.ts` pre-filled from PDF-derived values then last-used (`localStorage`);
  the same pool is reused for conversion when Convert is clicked (the gesture for the FSA
  picker). Spec §5.4 fields, persisted carry-over excludes per-issue ones.
- **Phase 7 — UX hardening.** Progress, cancel, warn-and-continue summary, encrypted/corrupt
  handling, size/page-count warning.
- **Phase 8 — Fast-follow (separate sign-off).** PWA (manifest + service worker) layered on
  the GitHub Pages hosting established in Phase 1.

## Verification

Unit (vitest) for every `core/` module — especially `runtime-capabilities` across mocked
feature/resource combos and `comicinfo`/`naming` correctness. Integration (headless
Playwright) drives a fixture PDF through the built app and asserts the `.cbz` contains the
ordered images + `ComicInfo.xml`; run once forced high-capability and once forced low.
Manual: open the `.cbz` in a real reader. Per phase: clean `npm run build`, TS strict, no
runtime network requests. CI (GitHub Actions) runs lint/typecheck/test/build on every PR and
push; the deploy workflow publishes `dist/` to GitHub Pages. Full criteria in spec §9–§10.

## Version control workflow

Each phase on its own branch off `main` (e.g. `phase-1-scaffold`); commit every change
(with `Co-Authored-By` trailer); commit messages are self-describing checkpoints. At phase
completion (tests green + sign-off): squash-merge to `main` and `git push`. `main` stays
releasable — one clean commit per phase.

## Cross-agent handoff

Resumable by any agent (Claude Code, Google Antigravity, OpenCode, OpenAI Codex, …) at any
commit:

- Authoritative artifacts are **in the repo** as plain markdown: this plan, the spec, and
  `PROGRESS.md`. `AGENTS.md` is the shared entry point and explains how to resume.
- `PROGRESS.md` is updated and committed with each change — state lives in the repo, not in
  any session.
- Portable tooling only: standard `git` + `npm` scripts (`dev`/`build`/`test`/`preview`).
  No dependence on a specific harness, skill, or MCP server.
