import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useBoardSwipe } from '@/components/board/useBoardSwipe';
import { CompleteItemSheet } from '@/components/complete-item-sheet';
import { Loading, Toast } from '@/components/ui';
import { listSessionItems, setSessionItemState, type SessionItemView } from '@/db/repo';
import { unitPriceLabel } from '@/lib/labels';
import { colors, radius, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

export function BoardScreen({ sessionId }: { sessionId: string }) {
  const { invalidate } = useAppData();
  const { message, show } = useToast();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [target, setTarget] = useState<SessionItemView | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error } = useAsyncData(() => listSessionItems(sessionId), [sessionId]);

  const allItems = useMemo(() => data ?? [], [data]);
  const items = useMemo(() => allItems.filter((i) => i.state === 'to_buy'), [allItems]);
  const boughtCount = allItems.filter((i) => i.state === 'bought').length;
  const skippedCount = allItems.filter((i) => i.state === 'skipped').length;

  const index = Math.min(currentIndex, Math.max(0, items.length - 1));
  const current = items[index];
  const locked = busy || target !== null;

  // Gesture callbacks must stay stable; live values are read through this ref.
  const live = useRef({ current, locked, itemsLength: items.length, invalidate, show });
  useEffect(() => {
    live.current = { current, locked, itemsLength: items.length, invalidate, show };
  }, [current, locked, items.length, invalidate, show]);

  // The acted-on item leaves `items`, so the next one shifts into the same index.
  const advance = useCallback(() => {
    const { itemsLength } = live.current;
    setCurrentIndex((i) => (i + 1 >= itemsLength ? 0 : i));
  }, []);

  const pass = useCallback(async () => {
    const state = live.current;
    if (!state.current || state.locked) return;
    setBusy(true);
    try {
      await setSessionItemState(state.current.id, 'skipped');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      state.invalidate();
      state.show(`${state.current.name} skipped`);
      advance();
    } finally {
      setBusy(false);
    }
  }, [advance]);

  const openEditor = useCallback(() => {
    const state = live.current;
    if (!state.current || state.locked) return;
    setTarget(state.current);
  }, []);

  const { translateX, panResponder, onTap } = useBoardSwipe({
    onSwipeRight: pass,
    onSwipeLeft: openEditor,
    onDoubleTap: openEditor,
    disabled: locked,
  });

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.red, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  if (loading || !data) {
    return <Loading label="Opening the board…" />;
  }

  if (!current) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40 }}>🎉</Text>
        <Text style={[text.h2, { textAlign: 'center', marginTop: space.sm }]}>All done!</Text>
        <Text style={[text.small, { textAlign: 'center', marginTop: 4 }]}>
          {boughtCount} bought · {skippedCount} skipped
        </Text>
      </View>
    );
  }

  const lastPrice = unitPriceLabel(current.previous, current.baseUnit);
  const planned =
    current.plannedQty !== null && current.plannedUnitLabel
      ? `${current.plannedQty} ${current.plannedUnitLabel}`
      : null;
  const detail = [lastPrice ? `last ${lastPrice}` : 'no history', planned].filter(Boolean).join(' · ');

  return (
    <View style={styles.board}>
      <View style={styles.progress}>
        <Text style={text.tiny}>
          ITEM {index + 1} OF {items.length}
        </Text>
        <Text style={text.tiny}>{items.length - index - 1} LEFT</Text>
      </View>

      <View style={styles.cardWrap}>
        <View style={styles.underlay} pointerEvents="none">
          <Text style={[styles.underlayLabel, { color: colors.amber }]}>↺ PASS</Text>
          <Text style={[styles.underlayLabel, { color: colors.green }]}>EDIT →</Text>
        </View>

        <Animated.View
          style={[styles.card, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          <TouchableWithoutFeedback onPress={onTap}>
            <View style={styles.inner}>
              <Text style={styles.name}>{current.name}</Text>
              <Text style={[text.small, { marginTop: 4 }]}>{detail}</Text>
              <Text style={[text.tiny, { marginTop: 12 }]}>DOUBLE-TAP TO MARK BOUGHT</Text>
            </View>
          </TouchableWithoutFeedback>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityLabel="Swipe right to pass"
              style={[styles.actionButton, locked && styles.actionDisabled]}
              disabled={locked}
              onPress={pass}
            >
              <Text style={styles.actionText}>↺ Pass</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Swipe left to edit"
              style={[styles.actionButton, locked && styles.actionDisabled]}
              disabled={locked}
              onPress={openEditor}
            >
              <Text style={styles.actionText}>✎ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Double-tap to mark bought"
              style={[styles.actionButton, locked && styles.actionDisabled]}
              disabled={locked}
              onPress={openEditor}
            >
              <Text style={[styles.actionText, { color: colors.green }]}>❤️ Bought</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <CompleteItemSheet
        target={target}
        visible={target !== null}
        onClose={() => setTarget(null)}
        onDone={() => {
          invalidate();
          show('Purchase recorded');
          advance();
        }}
      />

      <Toast message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: space.md },
  progress: { flexDirection: 'row', justifyContent: 'space-between' },
  cardWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  underlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  underlayLabel: { fontWeight: '800', fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    minHeight: 180,
    gap: space.md,
  },
  inner: { flexDirection: 'column', gap: 4 },
  name: { ...text.h3, fontSize: 24 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
});
