# Suki — wet market price memory

Android-first, offline-only shopping companion for the palengke. Plan a list, see what you paid last time, check the lowest price you have ever logged, verify vendor math with a scale calculator, and watch a session budget drain as you swipe items bought.

Everything lives in SQLite on the phone. No account, no cloud, no network calls.

## Features

- **Sessions** — one per market trip, each with its own budget, name and date. Start a new one, duplicate a past one (with options), or edit any of them later.
- **List + Board** — checklist view and a two-column board. Swipe right to buy, swipe left to skip, tap to enter the exact amount.
- **Budget bar** — green under budget, amber near the limit, red with the exact overage. Every purchase deducts immediately.
- **Price history** — last price, lowest recorded price, and per-item history. Comparisons are per base unit (₱/kg, ₱/L, ₱/pc), never raw totals.
- **Optional units** — items can be created with no unit at all. Comparisons then fall back to "reference only" rather than pretending to be accurate. Units can be added later; old unit-less entries stay unit-less.
- **Scale calculator** — ₱100/kg + spend ₱50 → ½ kg / 500 g. Or 750 g → ₱75. Includes fraction labels, a gauge, and "apply to a list item".
- **My Items catalog** — searchable, sortable by usage, with last/lowest price and purchase counts. Re-add items from past trips in bulk.
- **Backup** — manual export/import of a JSON file, plus a rolling weekly backup inside app storage.

## Stack

| Concern | Choice |
| --- | --- |
| App | Expo SDK 58, React Native 0.88, TypeScript |
| Navigation | Expo Router (tabs + stack) |
| Storage | `expo-sqlite` with Drizzle ORM schema definitions and versioned SQL migrations |
| Money | integer centavos, no floats |
| Weight | integer grams / millilitres / pieces |
| Tests | Jest (`src/lib/pricing.test.ts`) |

## Local development

```bash
npm install
npx expo start          # dev server
npx expo run:android    # build + install a debug build on a device
```

Typecheck and tests:

```bash
npx tsc --noEmit
npx jest
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for project history and version changes.

## Building the release APK

The generated `android/` directory is checked in for this working copy. Requirements:

- JDK 17
- Android SDK with `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`

```bash
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
cd android
./gradlew :app:assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

**⚠️ Debug keystore warning:** The release build currently signs with the debug keystore and targets `arm64-v8a` only (all mainstream Android phones since ~2018). For Play Store distribution, configure a real signing key and add the other ABIs or ship an AAB. **Changing the signing key after the app is installed forces an uninstall and wipes all local data — create and back up a real keystore before distributing.**

## Data model

`item`, `item_unit`, `session`, `session_item`, `price_entry` — see `src/db/schema.ts` for the model and `src/db/index.ts` for migrations.

Key invariants:

1. `price_entry.total_centavos` is mandatory; unit-backed fields are optional.
2. Per-base price is derived at read time, never stored as truth.
3. Items referenced by price history are archived, not deleted.
4. A purchase is written in a single SQLite transaction together with the session item state and session timestamps.
5. `session_item.voided_at` is set on removal; "Undo" clears it. Price entries use `voided_at` for soft-delete, not physical deletion.
6. Only `price_entry` rows with `kind = 'purchased'` AND `voided_at IS NULL` count for last/lowest price and budget calculations.

## Layout

```
src/app/            routes (tabs, session detail, item detail)
src/components/     UI primitives, swipe row, budget bar, sheets
src/db/             schema, client + migrations, repository
src/lib/            pricing math, formatting, ids, backup
src/state/          data version context and query hook
```