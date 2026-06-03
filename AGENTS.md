# AGENTS.md

Guidance for AI agents and human contributors working in this repository.
Read this before making changes. Where it conflicts with a direct user instruction,
the user wins.

## 1. Project

`pdf-to-cbz` converts PDFs (commonly zines) into **CBZ** files — the comic-archive
format that reader apps expect — **entirely in the browser**. There is no backend.
The app is a static site served from GitHub Pages; all parsing, rendering, and
archiving happen on the user's device.

A CBZ is simply a ZIP archive containing the page images in reading order.

## 2. Non-negotiable constraints

These are the project's reason for existing. Do not violate them, and flag any change
that would.

- **Client-side only.** No backend, no API calls, no uploads. After the app's own
  assets load, it makes **zero network requests**. User PDFs never leave the device.
- **Why it matters:** (a) the app must work **offline as an installable PWA**, and
  (b) — the primary motivation — **minimize network traffic** (large PDFs are never
  uploaded).
- **Installable, offline-capable PWA.** A service worker + web app manifest are
  in-scope goals. The service worker may cache the app shell and bundled
  dependencies, but **must never cache or transmit user files**.
- **No telemetry or analytics.** No third-party tracking, no phone-home.
- **License: AGPL-3.0-or-later.** New source files carry an SPDX header:
  `// SPDX-License-Identifier: AGPL-3.0-or-later`. Keep dependencies license-compatible.

## 3. Target environment

- **Required:** current desktop Chrome/Edge/Firefox/Safari **and Mobile Chrome**.
- **Best-effort:** Mobile Safari — keep it working where cheap, but it **may be
  dropped for Phase 1** rather than block progress. Document any Safari-only gaps.
- **No hard dependency on the File System Access API** (absent on mobile/Safari).
  Use it only as progressive enhancement with a universal fallback.
- Assume **constrained mobile memory**. Feature-detect modern APIs
  (e.g. `OffscreenCanvas`) and degrade gracefully.

## 4. Memory & worker discipline

The main risk in this app is running out of memory on a large PDF on a phone.

- Run PDF parsing, rasterization, and zipping **off the main thread** (WebWorker).
- The app processes **one PDF at a time** — keep the memory model simple.
- **Stream** pages into the archive and **release buffers as soon as possible**.
  Do not hold every decoded page in memory at once.
- Provide visible progress and a way to cancel; clean up partial state on cancel.

## 5. Coding standards

- **TypeScript, strict mode.** No implicit `any`.
- **Small, single-purpose modules** with clear, documented interfaces. A reader
  should understand what a module does without reading its internals. If a file grows
  large, that's a signal it's doing too much — split it.
- **Separate pure logic from glue.** Keep conversion/format logic free of DOM and
  worker plumbing so it can be unit-tested in isolation.
- **Comments follow `docs/conventions/clean-documentation.md` — required for every
  agent.** Explain present-tense intent the code can't express; never narrate history
  ("changed from…", "was 5", "per review", bug logs) and never leave commented-out
  alternatives. Apply it whenever you write or edit a comment — most of all right after
  fixing a bug or refactoring. Change history belongs in the commit message.
- Match the style of surrounding code. Prefer clarity over cleverness.

## 6. Testing & verification

- Pure logic (page ordering, filename sanitization, format selection, archive
  assembly) must have **unit tests**.
- The end-to-end success check: take a **real PDF**, convert it, and confirm the
  resulting `.cbz` **opens correctly in a real comic reader** with pages in order.
- Don't claim something works without running it. Report failures with the output.

## 7. Method, contributing & decisions

- **Spec-Driven Development.** `docs/spec/pdf-to-cbz-v1.md` is the source of truth.
  Change the spec first, then `docs/plan/implementation.md`, then code. Keep
  `PROGRESS.md` updated and committed with every change.
- **Branch & commit workflow.** Each phase on its own branch off `main`; commit every
  change (with a `Co-Authored-By` trailer) as a self-describing checkpoint. At phase
  completion (tests green + sign-off), squash-merge to `main` and push — one clean
  commit per phase; `main` stays releasable.
- **Decisions** are recorded in the planning doc
  (`docs/planning/architecture-decisions.html`) and §8 below. Write down any decision a
  future contributor would otherwise have to reverse-engineer.
- **Keep docs current — no stale docs.** When behavior, decisions, or process change,
  update the affected docs (this file first) in the **same** change. A doc that
  contradicts reality is a bug; fix it on sight.
- **Lessons learned go in `docs/conventions/working-agreements.md`** (the running log
  there), not in any agent's private memory — so every agent sees them. That file also
  holds our planning/build working agreements.

## 8. Architecture (decided 2026-06-03)

See `docs/planning/architecture-decisions.html` for the rationale behind each choice.

- **Simple & event-driven (overriding principle).** Favor the fewest moving parts that
  solve the problem (YAGNI; no speculative abstraction). Components **react to events** —
  DOM events in the UI, `postMessage` between the main thread and workers, and a
  progress/page-done/warning/complete event stream from the conversion job — rather than
  polling or shared mutable state. The controller is a small state machine; backpressure
  flows through acknowledgements, not busy-waiting.
- **Stack:** TypeScript (strict) + **Vite**, **no UI framework** (vanilla TS/DOM).
  Static build, deployed to GitHub Pages.
- **PDF engine:** **pdf.js** (Mozilla), **bundled** as first-party assets (no CDN);
  its worker and any wasm ship with the app.
- **Conversion — hybrid extract-or-render:** per page, if the page is a single
  full-page image, **extract its original encoded bytes losslessly**; otherwise
  **rasterize** the page via pdf.js. Rendered pages are encoded to **WebP** (JPEG
  fallback where WebP canvas export is unavailable). Extracted pages keep their
  original bytes/format. Beware exotic embedded codecs (JBIG2/JPEG2000/CCITT) —
  fall back to render when extraction isn't safe.
- **Archive:** CBZ = ZIP built with **fflate** via its streaming API. Compression
  **adapts to runtime capability**: light DEFLATE when there's CPU/memory headroom,
  else STORE (pages are already compressed, so gains are mostly on `ComicInfo.xml`).
  Pages are named zero-padded in reading order (`0001.<ext>`, `0002.<ext>`, …).
- **Metadata:** generate **`ComicInfo.xml`** at the archive root from the PDF's
  document info / XMP (Title, Writer←Author, Summary←Subject, Year/Month/Day,
  LanguageISO, PageCount, provenance in Notes). Mark **page 0 as `FrontCover`** in
  the `<Pages>` list so readers use the first page as the cover thumbnail. A
  pre-conversion form (pre-filled from the PDF, persisted locally) lets the user
  supply/override fields the PDF can't carry — Series, Number, credits, Genre,
  reading direction, etc.; user values win.
- **Runtime adaptation (no mobile/desktop hard-coding).** A single
  `core/runtime-capabilities.ts` probes features (OffscreenCanvas, WebP encode,
  `showSaveFilePicker`, module workers) and resources (`hardwareConcurrency`,
  `deviceMemory`). All behavior keys off *measured capability*, never device class.
- **Concurrency:** a **bounded worker pool** sized from that capability (clamped to a
  safe floor/ceiling; converges to single-worker on weak devices), with **backpressure**
  so only a few decoded pages are in flight — each streams into the archive and is
  released immediately. One PDF at a time. This bounded-pool + backpressure is the
  primary memory defense — never let the pool grow unbounded.
- **Output delivery:** **File System Access** streaming when `showSaveFilePicker` is
  present at runtime (lowest peak memory), else a universal **Blob + anchor** download.
- **Provisional defaults (may change):** rasterize to ~1600px long edge with a soft
  size/page-count **warning** (not a hard cap); an undecodable page → **warn and
  continue** (skip it, surface a summary), never a silent failure; **PWA** (service
  worker + manifest) lands as a fast-follow once conversion works.

## 9. Resuming work / handoff

This project is built to be picked up by **any** coding agent at **any** commit, not
just the session that started it. To resume:

1. Read this file, then **`PROGRESS.md`** (current state + active branch), then
   **`docs/spec/pdf-to-cbz-v1.md`** (the contract), **`docs/plan/implementation.md`**, and
   **`docs/conventions/working-agreements.md`** (working agreements + lessons learned).
2. `git log --oneline` shows the latest checkpoint; commit messages say what's next.
3. Continue at the first unchecked item in `PROGRESS.md`; update and commit it as you go.

Everything needed lives in the repo as plain markdown — no vendor-specific harness,
skill, or MCP server is required. Build/test/run via the standard `npm` scripts (added
in Phase 1): `npm run dev` · `npm run build` · `npm run preview` · `npm test`.
