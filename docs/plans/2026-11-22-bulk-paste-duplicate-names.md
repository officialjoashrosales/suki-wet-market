# Bulk paste: block duplicate item names

Status: planned
Severity: major
Branch: fix/bulk-paste-duplicate-names-major
Created: 2026-11-22
Updated: 2026-11-22

## Summary

Bulk paste currently collapses repeated names via `mergeParsedLines`, silently summing quantities (e.g. `Pakbet 1kl` + `pakbet 2kls` becomes one 3 kg row). Summing can cause over-buying, and the user is never told.

New rule: a duplicate item name in the paste **blocks saving**. The user must remove the duplicate line. Nothing is merged, summed, or overridden. Only the item name is compared — `pakbet` and `pakbets` are different items.

Classified MAJOR: shared parser/merge semantics, the bulk-paste write path, and the Add-to-list UI change together. No schema migration; `idx_sessionitem_pair` stays.

## Plan

1. **Parser** (`src/lib/checklist-parse.ts`)
   - Add missing aliases: `kls`, `kgs`, `gr`, `ltr` (required so `pakbet 2kls` parses to name `Pakbet`).
   - Add `normalizeItemName()`: trim, collapse whitespace, lowercase for comparison. No stemming, no fuzzy match.
   - Preserve source line numbers on parsed lines.
   - Stop calling `mergeParsedLines` from the paste flow.

2. **Duplicate detection** (`src/lib/checklist-parse.ts`, pure + tested)
   - `findDuplicateGroups(lines)` → `{ name, lineNumbers[] }` where names match exactly after normalization.
   - Tests: `Pakbet 1kl` + `pakbet 2kls` → duplicate; `pakbet` + `pakbets` → not duplicate; three occurrences; no duplicates; blank lines ignored for names but line numbers preserved.

3. **Blocking UI** (`src/components/add-items-sheet.tsx`, `src/components/ui.tsx`)
   - Preview lists every line; duplicates get a `×2` badge.
   - Add opens a blocking modal:
     ```
     Duplicate items found
     Pakbet — lines 1 and 14
     Remove one duplicate to continue.
     [ Edit list ]
     ```
   - Only **Edit list**; no save path while duplicates exist. Add is disabled until resolved, with an inline banner explaining why.
   - Edit list closes the modal, saves nothing, keeps the paste text, and focuses the textarea.

4. **Repo safety** (`src/db/repo.ts`)
   - `addParsedItemsToSession` no longer merges lines.
   - Defensively reject duplicate normalized names (throw) so the UI gate cannot be bypassed.
   - Existing session rows keep current update behavior; no schema change.

5. **Docs + verification**
   - Update `docs/bulk-checklist-paste.md` to describe the blocking rule.
   - `npx tsc --noEmit`, `npx jest`, `npx expo lint`.
   - Phone test with the 14-line example: modal lists `Pakbet` (lines 1 and 14); Edit list returns to editing; no rows saved.

## Open questions

- Does "duplicate" include an item already on the session list, or only duplicates within the paste? Recommended: within the paste only; already-on-list keeps the current update behavior.
- Add button: fully disabled while duplicates exist, or enabled and opens the modal? Recommended: enabled → modal, so the user gets the explanation.

## Pending tasks

- [ ] Confirm duplicate scope (paste-only vs. also already-on-list) — blocks Phase 3.
- [ ] Confirm Add button behavior (disabled vs. opens modal) — blocks Phase 3.
- [ ] Create branch `fix/bulk-paste-duplicate-names-major` from `main` before any code edit (MAJOR rule).
- [ ] Phase 1: parser aliases, `normalizeItemName()`, line numbers, stop merging.
- [ ] Phase 2: `findDuplicateGroups()` + tests.
- [ ] Phase 3: preview badges, blocking modal, Add gating.
- [ ] Phase 4: repo stops merging and rejects duplicate names defensively.
- [ ] Phase 5: update `docs/bulk-checklist-paste.md`; run tsc, jest, lint; phone test.
- [ ] Re-run AGENTS.md triage if scope grows (e.g. an "Add anyway" option would require a schema migration and reclassification).

## Progress / Notes

- 2026-11-22: Plan created and approved for documentation only. No code changed.
- Locked decisions: no merging, no summing, no "Add anyway"; exact normalized name match only; `pakbet` ≠ `pakbets`.
- Current branch is `main`; no implementation has started.

## Resume here

Get answers to the two open questions, then create branch `fix/bulk-paste-duplicate-names-major` and start Phase 1 (aliases + `normalizeItemName()` with tests).
