# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- Data model: `voided_at` soft-delete fields on `session_item` and `price_entry` tables
- Data model: `unit_size_in_base` column on `item_unit` table (clarified from `qty_in_base`)
- Pricing module: `comparePrice` three-state logic (comparable/partial/none) with verified flag handling
- Pricing module: `formatPerBase` human-readable price-per-unit formatting (₱/kg, ₱/L, ₱/pc)
- Pricing module: `budgetStatus` with under/near/over states and overage calculation
- PLAN.md: Decisions Log with 9 documented decisions (6 DECIDED, 3 PROPOSED)
- PLAN.md: Per-milestone status (Done/Partial/Not started) and "Status / Known issues / Next" section
- PLAN.md: Versioning decision added (see Versioning section below)
- README.md: Debug keystore warning before release build instructions
- README.md: Updated data model invariants with `voided_at` and filter conditions
- README.md: Layout ascii diagram updated
- CHANGELOG.md: Created (this file)

### Changed
- PLAN.md: Status changed from "Draft, approved feature set" to "Partial"
- PLAN.md: Data model tables restructured to match code: `item_unit.unit_size_in_base`, `price_entry.voided_at`, `session_item.voided_at`
- PLAN.md: All 7 milestones marked "Not started" with acceptance criteria
- PLAN.md: "Known issues / Next" section added with current issue tracking
- README.md: Debug keystore warning added (changing keystore forces uninstall + data wipe)
- README.md: Data model invariants updated (5 invariants, added 2 new ones about voided_at)
- README.md: Layout diagram updated to match current folder structure
- app.json: Version remains 1.0.0 (initial release)

### Fixed
- PLAN.md: "qty_in_base" dual meaning documented and clarified in Decisions Log #1
- PLAN.md: session_item_id SET NULL on session delete documented in Decisions Log #3
- PLAN.md: Date handling disambiguation (local date vs UTC timestamps) documented in Decisions Log #6
- PLAN.md: Currency display style (₱ one style) documented in Decisions Log #7
- README.md: Key invariants corrected: `voided_at` soft-delete on price_entry and session_item
- README.md: Filter condition clarified: only `kind='purchased' AND voided_at IS NULL` counts for last/lowest

## 1.0.0 — Initial Release

### Added
- Initial Drizzle schema with `item`, `item_unit`, `session`, `session_item`, `price_entry` tables
- Version 1 migration: all base tables and indexes
- Version 2 migration: `session_item.note` column
- `expo-sqlite` + Drizzle ORM integration
- `pricing.ts` pure math module with centavo-only arithmetic
- `pricing.test.ts` exhaustive unit tests (budgetStatus, comparePrice, formatMoney, formatWeight, formatPerBase, fractionLabel, parseMoneyInput, pricePerBase, weightForBudget, costForWeight)
- Expo Router navigation: (tabs) index, items, sessions, session/[id], item/[id], calculator
- Backup: manual JSON export/import via expo-sharing, rolling weekly auto-backup
- Core features: Sessions, List + Board, Budget bar, Price history with optional units, Scale calculator, My Items catalog
- Data invariants: total_centavos mandatory, per-base price derived not stored, ON DELETE RESTRICT on item references

### Changed
- (None — initial release)

### Fixed
- (None — initial release)

---

**Versioning decision** (recorded in PLAN.md §12): This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (MAJOR.MINOR.PATCH). The version is stored in `app.json` as `"version": "1.0.0"` and also appears in the app title (`Suki`). **Rule:** Update `CHANGELOG.md` with every change before committing. For each change, determine the version bump:
- **MAJOR** (x.0.0): Breaking changes, schema migrations that require data reset
- **MINOR** (0.x.0): New features, non-breaking schema additions, new milestones
- **PATCH** (0.0.x): Bug fixes, doc improvements, invariant corrections

When a migration is shipped, note the migration number in the CHANGELOG entry and whether the `schemaVersion` in export/import changed. Always verify the version in `app.json` is incremented appropriately.