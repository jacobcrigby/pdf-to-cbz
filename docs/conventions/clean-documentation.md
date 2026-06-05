---
name: clean-documentation
description: Use when writing, editing, or reviewing code comments or docstrings in any language — especially right after fixing a bug, refactoring, or responding to review feedback, when there is a pull to narrate the change, the old version, or what you tried. Triggers on comments like "// fixed", "// changed to", "// was 5", "// previously", "// per review", bug-history blocks, and commented-out alternatives left "just in case".
---

# Clean Documentation

## Overview

Source code is a snapshot of what the system **is right now** — not a commit log, a changelog, or a record of how it got here. A comment earns its place only by explaining a non-obvious _why_ the code itself can't express. The bug you fixed, the version before, the approach you rejected, the review that prompted the change — all belong in the commit message, never the source.

## The Core Distinction (read this first)

The trap: **change-narrative disguises itself as "why."** Both comments below claim to explain why — only one is allowed:

- ✅ **Standing why (present tense):** why the code is shaped this way, stated as a fact true _right now_.
  `Each attempt needs its own timeout; a retry count alone doesn't bound wall-clock time.`
- ❌ **Change-narrative (history):** the story of how the code got here.
  `Bug #1: the old version had no timeout and hung forever, so we added timeout= to fix it.`

Same underlying fact, two framings. State the constraint that is true today; delete the story of the fix. **"I'm documenting why, not what" is not a license to journal** — if a sentence only makes sense to someone who knows the previous version, it's history.

## When to Use

- Writing or editing any comment or docstring.
- Reviewing a diff — scan every new comment.
- Highest risk **right after** fixing a bug, refactoring, or addressing review feedback: the moments you most want to narrate the change.

**Keep a comment when** it states a non-obvious constraint, invariant, hardware/timing requirement, or rationale the code can't show. **Delete it when** it restates the code or recounts history.

## The Three Rules

1. **Present tense, current state only.** Describe what the code _does_ / _is_ — never what it _was_ or what _changed_.
2. **No journaling.** No bug history, old-version narration, discarded alternatives, "what I tried," review lore, or commented-out code. Git holds history; source holds state.
3. **Why, not how — and only when non-obvious.** Self-documenting code needs no comment. Explain intent the code can't express; never paraphrase the code.

## Before / After

Fixing a bug (Python):

```python
# ❌ narrates the bug and the fix
# Bug #2: the old version had no raise, so it returned None silently.
# We re-raise now so callers see the real error.
raise last_error

# ✅ states the present-tense reason
# Re-raise so a network failure surfaces here, not as a mystery NoneType later.
raise last_error
```

Refactor (TypeScript):

```typescript
// ❌ carries the old design forward
// Callers pass a Map (was previously a User[] scanned linearly).
// ✅ states today's contract
// Returns undefined for an absent id — same contract as a plain lookup.
return users.get(id);
```

Tuning a constant (C):

```c
// ❌ "// bumped from 10us per review"
// ✅ states the standing constraint and names the failure
/* ADS131M02 needs >=20us settling after a register write; shorter reads garbage. */
#define REG_SETTLE_US 20
```

## Quick Reference — run before keeping any comment

| Test    | Question                                                                | If yes                          |
| ------- | ----------------------------------------------------------------------- | ------------------------------- |
| History | Does it mention a past version, a bug, what changed, or what you tried? | Delete it                       |
| Tense   | Past-tense verbs — fixed, added, changed, removed, was, used to?        | Rewrite present tense or delete |
| Noise   | Could a competent reader get this straight from the code?               | Delete it                       |

## Red Flags — delete on sight

- `// fixed`, `// changed to X`, `// was 5`, `// previously`, `// no longer`, `// new`
- `// per review`, `// as requested`, `// TODO from last sprint`
- "Bug #1 / Bug #2", "the old version…", "read before simplifying this"
- A `HISTORY` or `WHY THIS VERSION EXISTS` block
- Commented-out alternatives kept "just in case"

## Common Rationalizations

| Excuse                                                      | Reality                                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "I'm documenting _why_, not what."                          | Why-it's-shaped-this-way (present) ✅. Why-it-changed (history) ❌. If it needs the old version to parse, it's history.                       |
| "It's a personal project — generous comments are fine."     | Personal ≠ diary. The change-story goes in the commit message; future-you reads `git log` / `git blame`, not narration baked into the source. |
| "The user _asked_ me to note what was going wrong."         | Put the standing constraint in the code; put the bug story in the commit message or PR. Both get documented — in the right place.             |
| "Recording the rejected options helps future decisions."    | State the current rule and its present-tense rationale. Rejected options live in the PR discussion, not the source.                           |
| "It's the spirit that matters and this comment is helpful." | Violating the letter is violating the spirit. A helpful-feeling history comment is still history. Delete it.                                  |
