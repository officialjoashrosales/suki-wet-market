import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, radius } from '@/lib/theme';

const DRAG_THRESHOLD = 6;

type PanHandlers = ReturnType<typeof PanResponder.create>['panHandlers'];

/** Vertical drag handle for reordering a list row. */
export function ReorderHandle({
  onStart,
  onMove,
  onEnd,
  onCancel,
  disabled = false,
  index = 0,
  count = 0,
  onAdjust,
}: {
  onStart: () => void;
  onMove: (dy: number, moveY: number) => void;
  onEnd: () => void;
  onCancel: () => void;
  disabled?: boolean;
  index?: number;
  count?: number;
  onAdjust?: (direction: -1 | 1) => void;
}) {
  const dragging = useRef(false);
  const [panHandlers, setPanHandlers] = useState<PanHandlers | null>(null);

  // Built in an effect so gesture callbacks always see fresh props. All
  // callbacks are stable, so this runs once per mount (not every render).
  useEffect(() => {
    const responder = PanResponder.create({
      // Claim the touch immediately so the parent list can't scroll-steal it.
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragging.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (!dragging.current) {
          if (
            disabled ||
            Math.abs(gesture.dy) <= DRAG_THRESHOLD ||
            Math.abs(gesture.dy) <= Math.abs(gesture.dx) * 1.2
          ) {
            return;
          }
          dragging.current = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onStart();
        }
        onMove(gesture.dy, gesture.moveY);
      },
      onPanResponderRelease: () => {
        if (dragging.current) onEnd();
        dragging.current = false;
      },
      // An interrupted gesture is a cancel, not a drop.
      onPanResponderTerminate: () => {
        if (dragging.current) onCancel();
        dragging.current = false;
      },
    });
    setPanHandlers(responder.panHandlers);
  }, [disabled, onStart, onMove, onEnd, onCancel]);

  return (
    <View
      {...(panHandlers ?? {})}
      style={[styles.handle, disabled && styles.disabled]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Reorder item"
      accessibilityValue={count > 0 ? { min: 0, max: count - 1, now: index } : undefined}
      accessibilityActions={
        onAdjust
          ? [
              { name: 'decrement', label: 'Move up' },
              { name: 'increment', label: 'Move down' },
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onAdjust?.(1);
        if (event.nativeEvent.actionName === 'decrement') onAdjust?.(-1);
      }}
    >
      <Text style={styles.icon}>⠿</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.4 },
  icon: { fontSize: 18, color: colors.faint, lineHeight: 22 },
});
