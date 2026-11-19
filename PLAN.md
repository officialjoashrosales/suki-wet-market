# Wet Market Companion — Formal Plan

**Status:** Draft, approved feature set
**Scope:** Android-first, offline-only MVP
**Date:** 2026-11-18

---

## 1. Problem Statement

When buying at the wet market (palengke), I have no reliable memory of what I paid last time. I want to know instantly whether a vendor's price is **higher or lower than my last purchase**, I want a shopping list that tells me the **lowest price I've ever seen** for each item, and I want a **budget-aware session** per market trip. Wet market quantities are awkward — priced per kilo but bought by peso amount — so I also need a **calculator with a weighing-scale helper**.

**Core user loop:**

> Plan a list before leaving → walk the market → check each item's price history at the stall → verify weight/price math → swipe items off as bought → watch the budget drain → review after.

---

## 2. Confirmed Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platform | Android first, iOS possible later | One codebase, no rewrite to reach iOS |
| Stack | Expo (React Native) + TypeScript | Offline SQLite is first-class; strong gesture story; single language for math + UI |
| Sync | **Local only**, no cloud | Explicitly deferred; no accounts, no server |
| Units | **Optional** on items | Item creation must never be blocked on unit data |
| Unit comparison | Three explicit states (Comparable / Partial / Reference-only) | Honest UI instead of silently wrong deltas |
| Storage | On-device SQLite | Device is the only copy → backup is mandatory |

> **Alternative not chosen:** Flutter + Drift achieves the same architecture. Would only be revisited if there's a preference for Dart.

---

## 3. Stack Specification

| Concern | Choice |
|---|---|
| Runtime / build | Expo SDK (latest), `expo-router` |
| Database | `expo-sqlite` + **Drizzle ORM** (typed queries + versioned migrations) |
| Gestures / board | `react-native-gesture-handler`, `react-native-reanimated` |
| Feedback | `expo-haptics` on swipe completion |
| Backup export | `expo-file-system` + `expo-sharing` |
| Unit tests | Jest (pure calc module) |
| E2E (Android) | Maestro (swipe flow coverage) |
| Money math | Integer **centavos** — no floats anywhere in the money path |
| Weight math | Integer **grams** (and mL for volume) |

### Project layout

```
app/                      # expo-router screens
  (tabs)/
    index.tsx             # active session / board
    items.tsx             # My Items table
    sessions.tsx          # session history
  session/[id].tsx        # session detail (list + board toggle)
  item/[id].tsx           # item detail + price history
  calculator.tsx
src/
  db/
    schema.ts             # Drizzle tables
    migrations/
    queries/              # typed query helpers
  lib/
    pricing.ts            # PURE math — single source of truth
    pricing.test.ts
    units.ts              # unit labels, formatting, fraction helpers
    budget.ts
  components/
    PriceBadge.tsx
    BudgetBar.tsx
    SwipeRow.tsx
    BoardColumn.tsx
    UnitPicker.tsx
```

---

## 4. Data Model

### 4.1 Tables

```ts
// item — canonical catalog entry
item {
  id: string            // UUIDv7, device-generated
  name: string
  category: string      // Pork | Fish | Veg | Pantry | Other
  dimension: 'weight' | 'volume' | 'count' | 'unspecified'   // default 'unspecified'
  base_unit: 'g' | 'mL' | 'pc' | null
  display_unit: string | null      // presentational only ('kg', 'pc')
  notes: string | null
  archived_at: string | null       // soft-hide, keeps history
  created_at: string
  updated_at: string
}

// item_unit — optional sell units, many per item
item_unit {
  id: string
  item_id: string                  // FK -> item, ON DELETE RESTRICT
  label: string                    // 'kg' | '500g pack' | 'tali'
  qty_in_base: number | null       // 1000 | 500 | null if unknown
  verified: boolean                // conversion factor trustworthy?
  is_default: boolean
  created_at: string
  updated_at: string
}

// session — one market trip
session {
  id: string
  name: string                     // 'Sunday Market'
  occurred_on: string              // date, editable
  budget_centavos: number
  status: 'draft' | 'active' | 'closed'
  duplicated_from: string | null   // provenance for copies
  created_at: string
  updated_at: string
}

// session_item — the shopping list line
session_item {
  id: string
  session_id: string               // FK -> session, CASCADE
  item_id: string                  // FK -> item, RESTRICT
  planned_qty: number | null
  planned_unit_id: string | null
  state: 'to_buy' | 'bought' | 'skipped'
  sort_order: number
}

// price_entry — every recorded quote / purchase
price_entry {
  id: string
  item_id: string                  // FK -> item, RESTRICT
  session_id: string | null
  session_item_id: string | null
  item_unit_id: string | null      // null when purchase had no unit
  unit_price_centavos: number | null   // 100 pesos per 1 kg -> 10000
  qty_in_base: number | null       // grams / mL / pieces
  total_centavos: number           // ALWAYS present — what was paid
  kind: 'planned' | 'purchased'
  purchased_at: string
  note: string | null
  created_at: string
  updated_at: string
}
```

### 4.2 Invariants

1. `total_centavos` is the only mandatory money field — a purchase with unknown unit/qty is still recordable.
2. `price_per_base` is **derived, never stored as truth**: `unit_price_centavos / qty_in_base`. A cached index column may exist for sorting only.
3. All weights/mL are integers; all money is integer centavos.
4. Items referenced by `price_entry` are **archived, not deleted** (`ON DELETE RESTRICT`).
5. Every row carries `updated_at`; IDs are UUIDv7 (time-sortable) for future export merge.

### 4.3 Indexes

```sql
CREATE INDEX idx_price_item_date  ON price_entry(item_id, purchased_at DESC);
CREATE INDEX idx_price_session    ON price_entry(session_id);
CREATE INDEX idx_sessionitem_sess ON session_item(session_id, sort_order);
CREATE INDEX idx_item_name        ON item(name COLLATE NOCASE);
```

---

## 5. Feature Specification

### 5.1 Consistent Unit Matching

**Rule: never compare two prices unless they are expressed in the same base unit.**

Dimensions and base units:

| Dimension | Base unit | Typical items |
|---|---|---|
| Weight | grams (`g`) | pork, fish, rice, tomatoes |
| Volume | milliliters (`mL`) | oil, vinegar, milk |
| Count | pieces (`pc`) | eggs, canned goods |
| Unspecified | `null` | anything entered without unit detail |

Comparison states:

| State | Condition | UI |
|---|---|---|
| **Comparable** | Both entries have a verified base unit | `down 15 pesos cheaper than last time`, `up 20 pesos higher`, `= same`, plus "Lowest ever: 85 pesos/kg" |
| **Partial** | Unit present but conversion unverified, or mixed units | Delta shown with warning chip: "estimate only" |
| **Reference only** | Either entry has no unit | No delta; grey "Last time: 120 pesos total" |

**Display normalization:** prefer the human unit. If base is `g` and qty >= 1000 g show `per kg`, otherwise `per g`. Never show a bare per-gram price alone — show both forms.

**Entry guardrails**
- Item creation asks for a unit but **never requires it**. Default dimension is `unspecified`.
- Price field's unit picker offers the item's registered units plus **"+ Add unit"**, which asks for a conversion factor (`1 pack = ___ g`); an unanswered factor saves the unit with `verified = false`.
- Unverified conversions are excluded from "lowest price" rankings.
- Changing an item's base unit when history exists triggers a warning + explicit choice (convert history / split into new item). No silent reinterpretation.

**Retroactive upgrade path:** any Reference-only item shows a subtle `+ Add unit` affordance. Future entries become comparable; past unit-less entries remain unit-less, stay visible in the timeline as "120 pesos (no unit)", and are excluded from min-price math.

### 5.2 My Items (Master Table)

The catalog is the source of truth for re-adding — never free-text.

| Column | Notes |
|---|---|
| Item name | searchable, sortable |
| Category | filter chip |
| Unit | `kg` / `pc` / `—` |
| Last price | most recent purchased, with date |
| Lowest price | all-time min (verified units only), with date |
| Avg price | last 5 purchases (optional, phase 2) |
| Times bought | drives default sort |
| Last bought | date |
| Status | active / archived |

- Sort: **most used** (default) / most recent / name.
- Multi-select then "Add N items to session", planned qty pre-filled from last purchase.
- Inline create: unknown name offers "Create '<name>' as new item"; fuzzy-match guard against duplicates ("Did you mean 'Bangus (milkfish)'?").
- Rows show last + lowest price immediately, so expectations are set before leaving the house.
- Items already in the target session render greyed with "already added".

### 5.3 Sessions & Budget

- **Create:** name, date (default today), budget in pesos.
- **Budget bar** pinned to top: budget - spent - left.
  - Green under budget; amber when < 10% remains; **red over budget** with exact overage ("120 pesos over budget").
- **Deduction:** every completed item's `total_centavos` deducts from remaining budget automatically.
- **Editing (always allowed):**
  - Name / date / budget edits recompute the bar live.
  - Add / remove / reorder / change planned qty.
  - Removing a purchased item refunds its amount with **Undo**.
  - Editing a purchased item's unit triggers a confirm, then recomputes that item's badges for the session.
  - Lowering budget below spent shows red state; spending is never blocked.
- **History:** past sessions listed with total spend and variance vs budget.

### 5.4 Session Duplication

**Duplicate** creates a new session with:
- New UUID, `status = draft`, `occurred_on` = today (editable), name "<original> (copy)".
- Budget copied and editable before save.
- `session_item` rows copied with **planned qty/unit**, `state` reset to `to_buy`, `sort_order` preserved.
- No `price_entry` copied — actual prices and quantities cleared.
- Each line still shows "Last time: 90 pesos/kg", sourced from history, not from the copy.
- `duplicated_from` records provenance.

**Options sheet before creating:**

| Option | Default |
|---|---|
| Include items already bought last time | on |
| Copy planned quantities | on |
| Budget | keep / set new / adjust by percent |
| Date | today / pick a date |

### 5.5 List & Board with Swipe-to-Complete

**Two views of the same data, toggleable:**
- **List** — compact checklist: name, planned qty, last price, lowest price.
- **Board** — two columns, **To Buy -> Bought**, draggable cards showing remaining vs completed at a glance.

**Swipe behavior:**
- Swipe right on a To Buy item completes it.
- If the item has no actual price/qty yet, a bottom sheet appears to confirm **total paid** (required), **weight/qty** (optional), and **unit** (optional for unit-less items).
- Successful completion: haptic tick, card animates to Bought, `session_item.state = 'bought'`, one `price_entry` written, budget bar animates.
- Swipe left marks it **Skip** (`state = 'skipped'`, no budget effect, restorable).
- Unswipe / tap Bought card reopens the sheet to edit actuals, recalculating budget.
- **Atomicity:** the completion is a single SQLite transaction touching `session_item`, `price_entry`, and session totals. A crash mid-swipe cannot leave a half-deducted budget.

### 5.6 Calculator & Weighing Scale Helper

Two-way conversion against a price per unit:

- **By budget** — 100 pesos / 1 kg, spend 50 pesos -> **1/2 kg** (0.5 kg / 500 g). Spend 20 pesos -> **1/5 kg** / 200 g.
- **By weight** — 100 pesos / kg, scale reads 750 g -> **75 pesos**, with a check against what the vendor asks.

**Presentation:**
- Fraction + decimal + base unit shown together (`1/4 kg · 0.25 kg · 250 g`).
- Visual scale gauge / bar with tick marks at `1/4`, `1/3`, `1/2`, `2/3`, `3/4`, `1`.
- **Quick-apply**: fills the calculated qty + total directly into the active session item, in one tap.
- **Missing-unit fallback:** plain amount splitter — "50 pesos of a 100 peso pack = half a pack" — or a straight amount calculator when pack size is unknown.

### 5.7 Backup (mandatory — no cloud)

Because the phone holds the only copy:

- **Manual export** -> JSON via `expo-sharing` (Drive, email, Files).
- **Weekly auto-backup** to app-local storage, keep last 4.
- **CSV export** of price history for spreadsheet inspection.
- **Import** merges idempotently by UUID — safe to import the same file twice.
- No accounts, no server, no connectivity checks anywhere in the app.

---

## 6. Pricing Module (single source of truth)

`src/lib/pricing.ts` — pure functions, no React, no DB. Used by the calculator, item form, budget bar, board, and badges.

```ts
pricePerBase(unitPriceCentavos, qtyInBase): number | null
costForWeight(unitPriceCentavos, qtyInBase): number
weightForBudget(budgetCentavos, unitPriceCentavos, qtyInBase): number
budgetStatus(budgetCentavos, spentCentavos):
  { state: 'under' | 'near' | 'over', remainingCentavos, overageCentavos }
comparePrice(current, previous):
  { state: 'comparable' | 'partial' | 'none', deltaCentavos?, deltaPct? }
formatMoney(centavos): string           // '1,240.50 pesos'
formatWeight(baseQty, baseUnit): string  // '750 g' | '1.25 kg' | '0.5 kg (500 g)'
fractionLabel(qtyInBase, unit): string   // '1/2 kg' | '3/4 kg'
```

**Requirements:**
- Integer-only arithmetic; guard against division by zero and negatives.
- Rounding policy documented in the module and covered by tests (money rounds half-up to the centavo; weight never rounds below 1 g when nonzero).
- No locale-dependent formatting inside the math layer.

---

## 7. Build Order & Milestones

| # | Milestone | Contents | Exit test |
|---|---|---|---|
| 1 | **Foundation** | Expo scaffold, Drizzle schema, migrations, UUIDv7, `pricing.ts` + Jest | Schema migrates from empty; pricing tests green |
| 2 | **My Items** | Catalog table, search/sort/filter, create with optional unit, archive, inline dedupe | Can create 10 items in airplane mode, 3 with no unit |
| 3 | **Sessions** | Create/budget, budget bar, full editing + undo, duplicate with options | Duplicate a past session, edit budget, bar updates live |
| 4 | **List + Board** | To Buy/Bought, swipe complete/skip, confirm sheet, atomic writes, haptics | Swipe flow never leaves a half-written budget |
| 5 | **Comparison** | Three-state badges, last/lowest price queries, history timeline | Mixed-unit item shows "estimate only", unit-less shows reference-only |
| 6 | **Calculator** | Two-way conversion, gauge, fractions, quick-apply, fallback | 100/kg + 50 -> 1/2 kg; 100/kg + 750 g -> 75 |
| 7 | **Backup** | JSON export/import, weekly auto-backup, CSV history | Export -> wipe -> import restores everything; double-import is harmless |

**MVP cut line: milestones 1–5.** Milestones 6–7 follow immediately; backup is prioritized because there is no cloud copy.

---

## 8. Testing Strategy

- **Unit (Jest):** `pricing.ts` exhaustively — round trips (`weightForBudget` <-> `costForWeight`), zero/negative guards, centavo rounding, fraction labels, all three comparison states, budget near/over thresholds.
- **DB (Jest + in-memory SQLite):** migration from empty, migration from seeded v1, `ON DELETE RESTRICT` behavior, transaction atomicity on simulated crash.
- **E2E (Maestro, Android):**
  1. Airplane-mode full loop: create session -> add items from catalog -> swipe complete with qty -> budget bar correct -> duplicate session.
  2. Unit-less item flow: complete with total only, confirm reference-only badge.
  3. Mixed-unit item: confirm "estimate only" chip.
- **Manual device passes:** real market run with the app for one week; log every point of friction before calling MVP done.
- **Determinism:** injectable clock for session dates and "last purchase" assertions.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Unit-less data is the path of least resistance, so most history becomes non-comparable | Non-blocking prompts at completion time ("add weight for future price checks?"), one tap to add; never force it |
| "Lowest price" looks wrong when it ignores unit-less entries | Badge footnote: "based on N comparisons"; unit-less entries listed separately |
| Local-only means data loss on phone loss/reset | Weekly auto-backup + prominent export; test import on a clean install |
| Swipe gestures conflict with Android back gesture / scroller | Edge-aware gesture thresholds; skip alternative via long-press |
| Budget bar drifting from line items | Single transaction per mutation; budget always derived from `price_entry` sums, not incremented separately |
| Market conditions: weak light, wet hands, one hand | Large swipe targets, high-contrast badges, haptics, no multi-step modals |

---

## 10. Explicitly Out of Scope

- Cloud sync, accounts, multi-device
- Price crowdsourcing / other users' prices
- Receipt OCR or barcode scanning
- Vendor / stall management
- Charts and analytics beyond last/lowest/average (phase 2 candidate)
- iOS build (architecture remains compatible)

---

## 11. Next Action

Switch out of Plan mode to begin **Milestone 1**: Expo scaffold, Drizzle schema + migrations, and the tested pricing module — everything downstream depends on those being correct.
