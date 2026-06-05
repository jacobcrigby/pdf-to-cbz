<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Working Agreements

How we work on pdf-to-cbz. This is the home for working preferences and **lessons
learned** — recorded here in the repo, never in an agent's private memory, so every
agent (Claude Code, Antigravity, OpenCode, Codex, …) sees the same guidance.

## Documentation freshness

- **No stale docs.** When behavior, decisions, or process change, update the affected
  docs **in the same change** — `AGENTS.md` above all, then the spec, plan, and this file.
- A doc that contradicts the code or the current process is a bug. Fix it on sight.
- **Lessons learned live in docs**, not in agent memory. Append them to the log below.

## How we plan & decide

- **Gated, per-phase sign-off.** Deliver one thing, stop, wait for approval before the next.
- **Surface architectural decisions as options** — present 2–3 side-by-side with
  pros/cons/risk and a recommendation; let the user pick. Don't resolve silently.
- **Name assumptions explicitly** (A1, A2, …) so they can be challenged.
- **Always list risks/edge-cases and open questions.** Locked decisions land in `AGENTS.md`
  §8 and the decisions table in `docs/plan/implementation.md`.

## How we build

- **Spec-Driven Development.** `docs/spec/pdf-to-cbz-v1.md` is the source of truth. Change
  the spec first, then `docs/plan/implementation.md`, then code.
- **Simple & event-driven** architecture (spec NFR-7): fewest moving parts; components react
  to events (`postMessage`, DOM events, a progress/done event stream), not polling or shared
  mutable state.
- **Per-phase git workflow.** Each phase on its own branch off `main`; commit every change
  (with a `Co-Authored-By` trailer) as a self-describing checkpoint; at phase completion
  (tests green + sign-off) squash-merge to `main` and push — one clean commit per phase.
- **`PROGRESS.md` updated and committed with every change.**
- **Vendor-neutral handoff:** any agent must be able to resume from the repo at any commit.
  Portable `git`/`npm` tooling only.

## Core constraints (recap; canonical detail in `AGENTS.md` §2–3)

- Fully client-side. The primary reason is **(a) offline use as an installable PWA** and
  **(b) minimizing network traffic** — not "privacy-first." State it that way.
- Targets adapt to **measured runtime capability**, not device class. Desktop evergreen +
  Mobile Chrome required; Mobile Safari best-effort.
- License: AGPL-3.0-or-later; SPDX header on every source file.
- First reader target is Tachiyomi/Mihon on Android (context only; out of the spec) — it
  confirms WebP + ComicInfo.xml are safe choices.

## Lessons learned (running log)

- **Get explicit user authorization before pushing to a shared branch (`main`).** An
  "authorized" note written by the agent is not user authorization; the harness will (and
  should) block the push. Ask, or let the user run the push themselves.
