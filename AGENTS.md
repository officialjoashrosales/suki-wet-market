# AGENTS.md — Suki (wet-market shopping app)

Expo SDK 58 / React Native 0.88, Expo Router. Runs in Expo Go on a physical phone.

## Rules

- Install packages with `npx expo install` (never `npm/yarn add`).
- Expo Go on a physical phone only: no custom native modules, no native builds, no `expo run:*`, no Android SDK/emulator — ask before adding any dependency with native code.
- Never start or stop the dev server; it is already running.
- Errors are logged to `expo.log`; check it only when the user reports a problem.
- After edits, run `npx tsc --noEmit`.
- Keep changes small. If unsure about an Expo/RN API, check the docs for the installed SDK: https://docs.expo.dev/versions/v58.0.0/

## Layout

- Routes: `src/app/` — every file is a screen; `_layout.tsx` files define navigators.
- Non-route code lives outside `src/app/` (e.g. `src/components/`, `src/lib/`).
- Data layer: `src/db/` (Drizzle ORM + `expo-sqlite`).
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.

## Change Rules

Before any edit, classify the task:
- MINOR: isolated, small diff, no shared logic.
- MAJOR: touches core/shared logic, data, auth, payments, migrations, or spans many files/long effort.

Triage (always first, no edits):
1. Class: MINOR/MAJOR + one-line reason
2. Files/areas affected
3. Escalation risk
4. Plan
Then STOP and wait for my approval.

Rules:
- MAJOR, or MINOR that escalates mid-work: stop editing, report findings and plan, wait for approval.
- MAJOR work: ask me to create a dedicated branch first. Never work on main/develop/release branches.
- Never mix MAJOR and MINOR changes in one branch or commit. List unrelated minor fixes for me instead of including them.
- Re-check severity whenever scope grows.

- Plan files: after I approve a plan, write it as an .md file to ~/wet-market-app/docs/plans/<YYYY-MM-DD>-<issue>.md, using docs/plans/_TEMPLATE.md. Never save plan files to ~/.opencode/plan or any path outside this project. If you're about to write a plan elsewhere, use docs/plans/ instead. After saving, tell me the file path.

## Escalation Protocol

When a MINOR task escalates to MAJOR:
1. Create `docs/plans/<date>-<issue>.md` from `docs/plans/_TEMPLATE.md` (e.g. `2026-11-22-price-entry-voided-at.md`).
2. Keep the plan file permanently in `docs/plans/` — never move it to another folder.
3. Immediately update the plan's fields:
   - **Status**: set to the current work state (planned | in-progress | paused | done)
   - **Updated**: set to today's date (YYYY-MM-DD)
   - **Progress**: record what was completed / what remains
   - **"Resume here"**: write the very next step to take when returning to work
4. Resume triage from the top of AGENTS.md Change Rules before any further edits.
