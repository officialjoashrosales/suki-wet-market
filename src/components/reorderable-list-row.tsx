import React, { useCallback, useMemo } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet } from 'react-native';

import type { SessionItemView } from '@/db/repo';
import { colors, radius } from '@/lib/theme';

import { ReorderHandle } from './reorder-handle';
import { SessionItemRow } from './session-item-row';

/** All drag callbacks are stable; only the per-row position changes. */
export interface DragHandleConfig {
  index: number;
  count: number;
  disabled: boolean;
  onStart: (item: SessionItemView) => void;
  onMove: (dy: number, moveY: number) => void;
  onEnd: () => void;
  onCancel: () => void;
  onAdjust: (item: SessionItemView, direction: -1 | 1) => void;
}

/**
 * Memoized so a drag only re-renders rows whose translate/elevation actually
 * changed. Animated values are mutated imperatively, not via props.
 */
export const ReorderableListRow = React.memo(function ReorderableListRow({
  item,
  onPress,
  onSkip,
  swipeable,
  translateY,
  elevated,
  onLayout,
  handle,
}: {
  item: SessionItemView;
  onPress: () => void;
  onSkip?: () => void;
  swipeable: boolean;
  translateY: Animated.Value;
  elevated: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  handle?: DragHandleConfig;
}) {
  const handleStart = useCallback(() => handle?.onStart(item), [handle, item]);
  const handleAdjust = useCallback(
    (direction: -1 | 1) => handle?.onAdjust(item, direction),
    [handle, item],
  );

  const dragHandle = useMemo(() => {
    if (!handle) return undefined;
    return (
      <ReorderHandle
        onStart={handleStart}
        onMove={handle.onMove}
        onEnd={handle.onEnd}
        onCancel={handle.onCancel}
        onAdjust={handleAdjust}
        disabled={handle.disabled}
        index={handle.index}
        count={handle.count}
      />
    );
  }, [handle, handleStart, handleAdjust]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[{ transform: [{ translateY }] }, elevated && styles.draggingRow]}
    >
      <SessionItemRow
        view={item}
        onPress={onPress}
        onSkip={onSkip}
        swipeable={swipeable}
        dragHandle={dragHandle}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  draggingRow: {
    zIndex: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
