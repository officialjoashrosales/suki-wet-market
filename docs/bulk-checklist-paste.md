# Bulk checklist paste

Paste a shopping list into a session’s **Add to list** sheet. One item per line. Names still go through the My Items catalog; the checklist itself stays on the session.

My Items is unchanged. New names from paste are created the same way as “+ Create …” today.

## What you type

The parser reads **from the right**: optional filler words, then a number + unit (or a peso amount), then the rest is the name.

| You type | Meaning | Stored |
| --- | --- | --- |
| `Pakbet 1kl` | 1 kilogram | name `Pakbet`, planned 1000 g, default `kg` unit |
| `Sili P20` or `Sili 20` | ₱20 worth (note only) | name `Sili`, note `₱20 worth` |
| `Cabbage 2pcs only` | 2 pieces | name `Cabbage`, planned 2 pc |
| `Calamansi` | name only | catalog item, no qty / note |

**Quantity units**

- Weight: `kg`, `kilo`, `kilos`, `kl`, `g`, `gram`, `grams`
- Volume: `l`, `liter`, `liters`, `ml`
- Count: `pc`, `pcs`, `piece`, `pieces`

**Peso-worth (a note, not money)**

- `P20`, `₱20`, `Php20`, `20 pesos`, or a **bare number with no unit** (`Sili 20`)

**Ignored filler:** `only`, `lang`

**Bare number = pesos, not pieces.** Pieces must say `pc` / `pcs`. `Cabbage 2` is ₱2 worth, not two heads.

Paste does **not** change the session budget and does **not** write a price entry.

## Sample paste

```
Pakbet 1kl
Sili P20
Cabbage 2pcs only
Calamansi
```

## Matching and session rows

- Match catalog by case-insensitive exact name (`Pakbet` = existing `Pakbet`).
- Missing name: create the catalog item; infer unit kind from the line (`weight` / `count` / `volume` / `none` for peso-only or name-only).
- Existing unit-less item + `1kl`: add the default kg unit, then set planned qty.
- Same item twice in the paste: one session row; combine qty if both are the same dimension, otherwise last non-empty qty/note wins.
- Already on the list: **update** planned qty/note instead of skipping.

Peso-worth is stored as `session_item.note` (nullable text), shown next to planned qty. Not a per-item money column.

## UI (Add to list)

Chip toggle next to search: **Paste list** vs the existing search-and-tick list.

- Multiline paste box
- Live preview: name, qty/unit or “₱N worth”, and “new” / “in catalog” / “already on list”
- One **Add** action: create missing catalog items, then insert or update session rows

Hint under the textarea should show the three patterns: `Pakbet 1kl`, `Sili P20`, `Cabbage 2pcs only`.

## Implementation notes

- Parser: `src/lib/checklist-parse.ts` with Jest cases in `src/lib/checklist-parse.test.ts`
- Schema: nullable `session_item.note TEXT` in Drizzle + versioned migration
- Repo: `addItemsToSession` (or sibling) accepts `{ itemId, plannedQty, plannedUnitId, note }`
- Display: session item row shows the note next to planned qty
- Branch: `feat/bulk-checklist-paste` from `main`

## Out of scope

- My Items bulk-create UI
- Per-item money / budget columns
- Changing Expo web SQLite
