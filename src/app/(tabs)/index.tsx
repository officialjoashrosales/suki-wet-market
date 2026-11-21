import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AddItemsSheet } from '@/components/add-items-sheet';
import { BoardScreen } from '@/components/board/BoardScreen';
import { BudgetBar } from '@/components/budget-bar';
import { CompleteItemSheet } from '@/components/complete-item-sheet';
import { CreateSessionSheet } from '@/components/create-session-sheet';
import { ReorderableListRow, type DragHandleConfig } from '@/components/reorderable-list-row';
import { Button, Chip, EmptyState, Loading, PageHeader, Screen, Toast } from '@/components/ui';
import {
  closeSession,
  getActiveSession,
  listSessionItems,
  reorderSessionItems,
  setSessionItemState,
  type SessionItemState,
  type SessionItemView,
} from '@/db/repo';
import { formatDate } from '@/lib/id';
import { formatMoney } from '@/lib/pricing';
import {
  buildOrderedIds,
  dropTranslateY,
  reorderWithinSection,
  type RowLayout,
} from '@/lib/session-order';
import { colors, radius, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

type ViewMode = 'board' | 'list';

const EDGE_ZONE = 96;
const MAX_AUTO_SCROLL_SPEED = 14;
const SETTLE_DURATION = 160;
const HAPTIC_THROTTLE_MS = 60;

interface DragState {
  phase: 'idle' | 'dragging' | 'settling';
  id: string | null;
  section: SessionItemState | null;
  sectionIds: string[];
  from: number;
  to: number;
  shift: number;
  dy: number;
  scrollStart: number;
}

const IDLE_DRAG: DragState = {
  phase: 'idle',
  id: null,
  section: null,
  sectionIds: [],
  from: -1,
  to: -1,
  shift: 0,
  dy: 0,
  scrollStart: 0,
};

type DragAction =
  | { type: 'start'; state: Omit<DragState, 'phase'> }
  | { type: 'move'; dy: number; to: number }
  | { type: 'settle' }
  | { type: 'reset' };

function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'start':
      return { ...action.state, phase: 'dragging' };
    case 'move':
      return state.phase === 'dragging' ? { ...state, dy: action.dy, to: action.to } : state;
    case 'settle':
      return state.phase === 'dragging' ? { ...state, phase: 'settling' } : state;
    case 'reset':
      return IDLE_DRAG;
  }
}

function pruneMap<T>(map: Record<string, T>, alive: Set<string>) {
  Object.keys(map).forEach((key) => {
    if (!alive.has(key)) delete map[key];
  });
}

export default function MarketScreen() {
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [mode, setMode] = useState<ViewMode>('board');
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<SessionItemView | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const { data, loading } = useAsyncData(async () => {
    const current = await getActiveSession();
    if (!current) return { session: null, items: [] as SessionItemView[] };
    return { session: current, items: await listSessionItems(current.id) };
  });
  const session = data?.session ?? null;

  const [localItems, setLocalItems] = useState<SessionItemView[] | null>(null);
  const [drag, dispatchDrag] = useReducer(dragReducer, IDLE_DRAG);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Adopt a fresh DB snapshot unless a drag is in progress. Once a drag ends
  // the optimistic order stays until invalidate() produces a new snapshot.
  const adoptedData = useRef<typeof data>(null);
  useEffect(() => {
    if (!data?.items || data === adoptedData.current) return;
    adoptedData.current = data;
    if (dragRef.current.phase !== 'idle') return;
    setLocalItems(data.items);
  }, [data]);

  const items = useMemo(() => localItems ?? data?.items ?? [], [localItems, data?.items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const dragY = useRef(new Animated.Value(0)).current;
  const settleAnim = useRef<Animated.CompositeAnimation | null>(null);
  const rowShifts = useRef<Record<string, Animated.Value>>({});
  const shiftTargets = useRef<Record<string, number>>({});
  const layouts = useRef<Record<string, RowLayout>>({});
  const measureFns = useRef<Record<string, (event: LayoutChangeEvent) => void>>({});
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const scrollTarget = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(Dimensions.get('window').height);
  const pointerY = useRef(0);
  const autoScrollRaf = useRef<number | null>(null);
  const lastTargetHaptic = useRef(0);

  const toBuy = useMemo(() => items.filter((item) => item.state === 'to_buy'), [items]);
  const bought = useMemo(() => items.filter((item) => item.state === 'bought'), [items]);
  const skipped = useMemo(() => items.filter((item) => item.state === 'skipped'), [items]);
  const positions = useMemo(() => {
    const map = new Map<string, { index: number; count: number }>();
    ([['to_buy', toBuy], ['skipped', skipped], ['bought', bought]] as const).forEach(([, list]) => {
      list.forEach((item, index) => map.set(item.id, { index, count: list.length }));
    });
    return map;
  }, [toBuy, skipped, bought]);

  function shiftValue(id: string): Animated.Value {
    let value = rowShifts.current[id];
    if (!value) {
      value = new Animated.Value(0);
      rowShifts.current[id] = value;
    }
    return value;
  }

  function measureRow(id: string) {
    let fn = measureFns.current[id];
    if (!fn) {
      fn = (event: LayoutChangeEvent) => {
        layouts.current[id] = {
          y: event.nativeEvent.layout.y,
          height: event.nativeEvent.layout.height,
        };
      };
      measureFns.current[id] = fn;
    }
    return fn;
  }

  useEffect(() => {
    const alive = new Set(items.map((item) => item.id));
    pruneMap(layouts.current, alive);
    pruneMap(rowShifts.current, alive);
    pruneMap(shiftTargets.current, alive);
    pruneMap(measureFns.current, alive);
  }, [items]);

  // Spring only the rows whose target actually changed.
  useEffect(() => {
    const state = dragRef.current;
    const targets: Record<string, number> = {};
    if (state.phase !== 'idle') {
      state.sectionIds.forEach((id, index) => {
        if (id === state.id || state.to < 0) {
          targets[id] = 0;
        } else if (state.from < state.to && index > state.from && index <= state.to) {
          targets[id] = -state.shift;
        } else if (state.from > state.to && index >= state.to && index < state.from) {
          targets[id] = state.shift;
        } else {
          targets[id] = 0;
        }
      });
    }
    items.forEach((item) => {
      const target = targets[item.id] ?? 0;
      if (shiftTargets.current[item.id] === target) return;
      shiftTargets.current[item.id] = target;
      Animated.spring(shiftValue(item.id), {
        toValue: target,
        useNativeDriver: true,
        bounciness: 0,
        speed: 30,
      }).start();
    });
  }, [drag.phase, drag.to, items]);

  useEffect(
    () => () => {
      if (autoScrollRaf.current !== null) cancelAnimationFrame(autoScrollRaf.current);
      settleAnim.current?.stop();
    },
    [],
  );

  function updateDrag(action: DragAction) {
    const next = dragReducer(dragRef.current, action);
    dragRef.current = next;
    dispatchDrag(action);
    return next;
  }

  function hapticForTarget() {
    const now = Date.now();
    if (now - lastTargetHaptic.current < HAPTIC_THROTTLE_MS) return;
    lastTargetHaptic.current = now;
    void Haptics.selectionAsync();
  }

  function computeTarget(state: DragState, total: number): number {
    if (!state.id) return state.from;
    const own = layouts.current[state.id];
    if (!own) return state.from;
    const center = own.y + own.height / 2 + total;
    let to = state.from;
    state.sectionIds.forEach((id, index) => {
      if (id === state.id) return;
      const other = layouts.current[id];
      if (!other) return;
      const otherCenter = other.y + other.height / 2;
      if (state.from < index && otherCenter < center) to = Math.max(to, index);
      if (state.from > index && otherCenter > center) to = Math.min(to, index);
    });
    return to;
  }

  function applyDragPosition() {
    const state = dragRef.current;
    if (state.phase !== 'dragging') return;
    const total = state.dy + (scrollTarget.current - state.scrollStart);
    dragY.setValue(total);
    const to = computeTarget(state, total);
    if (to !== state.to) {
      updateDrag({ type: 'move', dy: state.dy, to });
      hapticForTarget();
    }
  }

  function stopAutoScroll() {
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }

  function autoScrollTick() {
    const state = dragRef.current;
    if (state.phase !== 'dragging') {
      stopAutoScroll();
      return;
    }
    const height = viewportHeight.current;
    let velocity = 0;
    if (height > 0) {
      if (pointerY.current < EDGE_ZONE) {
        velocity = -Math.ceil(((EDGE_ZONE - pointerY.current) / EDGE_ZONE) * MAX_AUTO_SCROLL_SPEED);
      } else if (pointerY.current > height - EDGE_ZONE) {
        velocity = Math.ceil(((pointerY.current - (height - EDGE_ZONE)) / EDGE_ZONE) * MAX_AUTO_SCROLL_SPEED);
      }
    }
    if (!velocity) {
      stopAutoScroll();
      return;
    }
    const max = Math.max(0, contentHeight.current - height);
    const next = Math.min(max, Math.max(0, scrollTarget.current + velocity));
    if (next !== scrollTarget.current) {
      scrollTarget.current = next;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      applyDragPosition();
    }
    autoScrollRaf.current = requestAnimationFrame(autoScrollTick);
  }

  function updateAutoScroll(moveY: number) {
    pointerY.current = moveY;
    if (dragRef.current.phase !== 'dragging' || autoScrollRaf.current !== null) return;
    autoScrollRaf.current = requestAnimationFrame(autoScrollTick);
  }

  function startDrag(item: SessionItemView) {
    const layout = layouts.current[item.id];
    if (!layout || savingRef.current || dragRef.current.phase !== 'idle') return;
    const sectionIds = itemsRef.current.filter((i) => i.state === item.state).map((i) => i.id);
    const from = sectionIds.indexOf(item.id);
    if (from < 0) return;
    scrollTarget.current = scrollY.current;
    lastTargetHaptic.current = Date.now();
    updateDrag({
      type: 'start',
      state: {
        id: item.id,
        section: item.state,
        sectionIds,
        from,
        to: from,
        shift: layout.height + space.sm,
        dy: 0,
        scrollStart: scrollY.current,
      },
    });
    dragY.setValue(0);
  }

  function moveDrag(dy: number, moveY: number) {
    const state = dragRef.current;
    if (state.phase !== 'dragging') return;
    updateDrag({ type: 'move', dy, to: state.to });
    applyDragPosition();
    updateAutoScroll(moveY);
  }

  async function applyOrder(section: SessionItemState, from: number, to: number) {
    const source = itemsRef.current;
    if (!session || savingRef.current) return;
    const orderedIds = buildOrderedIds(source, section, reorderWithinSection(source, section, from, to));
    if (orderedIds.every((id, index) => id === source[index].id)) return;

    const previous = source;
    savingRef.current = true;
    setSaving(true);
    try {
      const byId = new Map(previous.map((item) => [item.id, item]));
      setLocalItems(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
      await reorderSessionItems(session.id, orderedIds);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      invalidate();
    } catch {
      setLocalItems(previous);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      show('Could not save the new order');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function cancelDrag() {
    const state = dragRef.current;
    if (state.phase === 'idle') return;
    stopAutoScroll();
    settleAnim.current?.stop();
    settleAnim.current = null;
    updateDrag({ type: 'reset' });
    dragY.setValue(0);
  }

  function endDrag() {
    const state = dragRef.current;
    if (state.phase !== 'dragging') return;
    stopAutoScroll();
    updateDrag({ type: 'settle' });

    if (state.from === state.to || !session || !state.id) {
      updateDrag({ type: 'reset' });
      return;
    }

    const targetId = state.sectionIds[state.to];
    const fallback = (state.to - state.from) * state.shift;
    const measured = targetId
      ? dropTranslateY(layouts.current, state.id, targetId, state.to > state.from)
      : null;
    settleAnim.current = Animated.timing(dragY, {
      toValue: measured ?? fallback,
      duration: SETTLE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    settleAnim.current.start(({ finished }) => {
      settleAnim.current = null;
      if (!finished) {
        cancelDrag();
        return;
      }
      const settled = dragRef.current;
      updateDrag({ type: 'reset' });
      if (settled.section) void applyOrder(settled.section, settled.from, settled.to);
    });
  }

  function adjustOrder(item: SessionItemView, direction: -1 | 1) {
    if (savingRef.current || dragRef.current.phase !== 'idle') return;
    const sectionIds = itemsRef.current.filter((i) => i.state === item.state).map((i) => i.id);
    const from = sectionIds.indexOf(item.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= sectionIds.length) return;
    void applyOrder(item.state, from, to);
  }

  async function skip(item: SessionItemView) {
    await setSessionItemState(item.id, 'skipped');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    invalidate();
    show(`${item.name} skipped`);
  }

  async function restore(item: SessionItemView) {
    await setSessionItemState(item.id, 'to_buy');
    invalidate();
    show(`${item.name} restored`);
  }

  // Stable wrappers keep memoized rows from re-rendering on every parent render.
  const handlers = useRef({ startDrag, moveDrag, endDrag, cancelDrag, adjustOrder });
  handlers.current = { startDrag, moveDrag, endDrag, cancelDrag, adjustOrder };
  const stableDrag = useMemo(
    () => ({
      start: (item: SessionItemView) => handlers.current.startDrag(item),
      move: (dy: number, moveY: number) => handlers.current.moveDrag(dy, moveY),
      end: () => handlers.current.endDrag(),
      cancel: () => handlers.current.cancelDrag(),
      adjust: (item: SessionItemView, direction: -1 | 1) => handlers.current.adjustOrder(item, direction),
    }),
    [],
  );

  const rowActionRef = useRef({
    press: (item: SessionItemView) => setTarget(item),
    skip: (item: SessionItemView) => {
      void skip(item);
    },
    restore: (item: SessionItemView) => {
      void restore(item);
    },
  });
  rowActionRef.current = {
    press: (item) => setTarget(item),
    skip: (item) => {
      void skip(item);
    },
    restore: (item) => {
      void restore(item);
    },
  };
  const rowCallbacks = useRef(new WeakMap<SessionItemView, { onPress: () => void; onSkip?: () => void }>());
  function actionsFor(item: SessionItemView) {
    let actions = rowCallbacks.current.get(item);
    if (!actions) {
      actions = {
        onPress: () => {
          if (item.state === 'skipped') rowActionRef.current.restore(item);
          else rowActionRef.current.press(item);
        },
        onSkip: item.state === 'to_buy' ? () => rowActionRef.current.skip(item) : undefined,
      };
      rowCallbacks.current.set(item, actions);
    }
    return actions;
  }

  interface HandleCacheEntry {
    index: number;
    count: number;
    disabled: boolean;
    config: DragHandleConfig;
  }
  const handleCache = useRef(new WeakMap<SessionItemView, HandleCacheEntry>());
  function handleFor(item: SessionItemView, position: { index: number; count: number }) {
    let entry = handleCache.current.get(item);
    if (!entry || entry.index !== position.index || entry.count !== position.count || entry.disabled !== saving) {
      entry = {
        index: position.index,
        count: position.count,
        disabled: saving,
        config: {
          index: position.index,
          count: position.count,
          disabled: saving,
          onStart: stableDrag.start,
          onMove: stableDrag.move,
          onEnd: stableDrag.end,
          onCancel: stableDrag.cancel,
          onAdjust: stableDrag.adjust,
        },
      };
      handleCache.current.set(item, entry);
    }
    return entry.config;
  }

  function renderListItem(item: SessionItemView) {
    const actions = actionsFor(item);
    const position = positions.get(item.id);
    const draggable = item.state === 'to_buy';
    return (
      <ReorderableListRow
        key={item.id}
        item={item}
        onPress={actions.onPress}
        onSkip={actions.onSkip}
        swipeable={draggable}
        translateY={drag.id === item.id ? dragY : shiftValue(item.id)}
        elevated={drag.phase !== 'idle' && drag.id === item.id}
        onLayout={measureRow(item.id)}
        handle={draggable && position ? handleFor(item, position) : undefined}
      />
    );
  }

  async function finishSession() {
    if (!session) return;
    await closeSession(session.id);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidate();
    show('Session closed');
  }

  if (loading && !data) return <Screen><Loading label="Opening your market list…" /></Screen>;

  return (
    <Screen>
      <PageHeader
        title="Suki"
        subtitle={
          session
            ? session.name.includes(formatDate(session.occurredOn))
              ? session.name
              : `${session.name} · ${formatDate(session.occurredOn)}`
            : 'Wet market prices, remembered'
        }
        right={
          session ? (
            <Button
              label="Edit"
              variant="secondary"
              compact
              onPress={() => router.push(`/session/${session.id}`)}
            />
          ) : undefined
        }
      />

      {!session ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <EmptyState
            emoji="🧺"
            title="No market session yet"
            body="Start a session, set a budget, and build your list. Every price you pay is remembered for the next trip."
            action={<Button label="Start a session" onPress={() => setCreateOpen(true)} />}
          />
          <View style={{ gap: space.sm }}>
            <MiniStep n="1" title="Build your list" body="Pick from items you already buy, or create new ones." />
            <MiniStep n="2" title="Check prices at the stall" body="See last time and lowest price before you pay." />
            <MiniStep n="3" title="Swipe when bought" body="The budget updates instantly, over-budget included." />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={drag.phase === 'idle'}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
            scrollTarget.current = event.nativeEvent.contentOffset.y;
            contentHeight.current = event.nativeEvent.contentSize.height;
          }}
          onContentSizeChange={(_, height) => {
            contentHeight.current = height;
          }}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
          }}
          scrollEventThrottle={16}
        >
          <BudgetBar budgetCentavos={session.budgetCentavos} spentCentavos={session.spentCentavos} />

          <View style={styles.toolbar}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Board" active={mode === 'board'} onPress={() => setMode('board')} />
              <Chip label="List" active={mode === 'list'} onPress={() => setMode('list')} />
            </View>
            <Button label="+ Add" compact onPress={() => setAddOpen(true)} />
          </View>

          {items.length === 0 ? (
            <EmptyState
              emoji="📝"
              title="Your list is empty"
              body="Add items to this session. Prices from your previous trips appear automatically."
              action={<Button label="Add items" onPress={() => setAddOpen(true)} />}
            />
          ) : mode === 'list' ? (
            <View style={{ gap: space.sm }}>
              {toBuy.length > 0 ? <Text style={styles.sectionLabel}>TO BUY · {toBuy.length}</Text> : null}
              {toBuy.map((item) => renderListItem(item))}

              {skipped.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: space.md }]}>SKIPPED · {skipped.length}</Text>
                  {skipped.map((item) => renderListItem(item))}
                </>
              ) : null}

              {bought.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: space.md }]}>
                    BOUGHT · {bought.length} · {formatMoney(session.spentCentavos)}
                  </Text>
                  {bought.map((item) => renderListItem(item))}
                </>
              ) : null}
            </View>
          ) : (
            <BoardScreen sessionId={session.id} />
          )}

          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button label="Close session" variant="secondary" onPress={finishSession} />
            <Text style={[text.small, { fontSize: 11, textAlign: 'center' }]}>
              Drag ⠿ to reorder · swipe right to mark bought · swipe left to skip · tap for the exact price
            </Text>
          </View>
        </ScrollView>
      )}

      <CreateSessionSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          invalidate();
          show('Session started');
        }}
      />

      {session ? (
        <AddItemsSheet
          visible={addOpen}
          sessionId={session.id}
          existingItemIds={items.map((i) => i.itemId)}
          onClose={() => setAddOpen(false)}
          onDone={(added) => {
            invalidate();
            show(added > 0 ? `Added ${added} item${added === 1 ? '' : 's'}` : 'Already on your list');
          }}
        />
      ) : null}

      <CompleteItemSheet
        target={target}
        visible={target !== null}
        onClose={() => setTarget(null)}
        onDone={() => {
          invalidate();
          show('Purchase recorded');
        }}
      />

      <Toast message={message} />
    </Screen>
  );
}

function MiniStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <View style={styles.miniStep}>
      <View style={styles.stepNumber}>
        <Text style={{ color: colors.green, fontWeight: '800' }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.h3}>{title}</Text>
        <Text style={[text.small, { fontSize: 12 }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: 32, gap: space.md },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionLabel: { ...text.tiny, marginTop: space.xs },
  miniStep: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'center',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
