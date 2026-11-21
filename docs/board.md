# Board Feature

One session item shown at a time. The user works through the list by priority (`session_item.sortOrder`): pass, edit, or mark bought. Right-handed, thumb-friendly.

## Target behavior (from redesign)

| Gesture | Action |
| --- | --- |
| Swipe right | Pass (skip), advance to next item |
| Swipe left | Open `CompleteItemSheet` (edit / mark bought) |
| Double-tap | Mark bought, advance (see open decisions) |
| Single tap | Optional focus/toggle |

Buttons stay as the fallback for every action: ↺ Pass, ✎ Edit, ❤️ Bought.
When all items are done, show a summary.

## Current state (actual code)

**Files**: `BoardScreen.tsx`, `useBoardSwipe.ts`, `SwipeRow.tsx` (list view).

**Data**: `listSessionItems(sessionId)` queries `session_item JOIN item LEFT JOIN item_unit`, sorted by `sortOrder`. `BoardScreen` filters to `to_buy` items and shows one at a time. Every action calls the shared `invalidate()` so the board refreshes.

**Gestures**: `useBoardSwipe` returns a `translateX` Animated value, `panResponder` handlers, and an `onTap` handler. Right swipe passes; left swipe opens `CompleteItemSheet`; double-tap opens the same sheet. The horizontal paging `ScrollView` was removed, so swipes no longer conflict with paging.

**Working today**: all three buttons, all three gestures, and an end-of-board summary with bought/skipped counts.

**Mark bought flow**: `CompleteItemSheet` requires Total paid (₱), optional weight/qty. `completeSessionItem` deletes the prior `price_entry`, inserts a new one, sets `session_item.state = 'bought'`, plays a haptic tick, and updates the budget bar.

## Decisions made

- **Double-tap**: opens `CompleteItemSheet` rather than completing instantly, since marking bought requires a total.
- **Swipe vs paging**: swipe performs the action and the board advances; there is no paging gesture.
- **Thresholds**: the board deliberately keeps its 120px threshold (vs `SwipeRow`'s 85px) because the card fills the screen.

## Remaining gaps

- No undo. `completeSessionItem` hard-deletes the prior `price_entry`, and the current schema has no `voided_at` column, so undo needs schema/repo work.
- Single tap is not wired to a focus/toggle (it was optional in the redesign).
