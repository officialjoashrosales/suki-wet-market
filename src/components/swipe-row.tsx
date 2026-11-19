import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/lib/theme';

export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  disabled,
  rightLabel = 'Bought',
  leftLabel = 'Skip',
}: {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  disabled?: boolean;
  rightLabel?: string;
  leftLabel?: string;
}) {
  const [translateX] = useState(() => new Animated.Value(0));
  const callbacks = useRef({ onSwipeRight, onSwipeLeft, disabled });

  useEffect(() => {
    callbacks.current = { onSwipeRight, onSwipeLeft, disabled };
  }, [onSwipeRight, onSwipeLeft, disabled]);

  // Callbacks are read at gesture time; React Compiler is disabled for this app.
  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        if (callbacks.current.disabled) return false;
        return Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2;
      },
      onPanResponderMove: (_, g) => {
        const clamped = Math.max(-150, Math.min(150, g.dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 85 && callbacks.current.onSwipeRight) {
          Animated.timing(translateX, {
            toValue: 500,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            callbacks.current.onSwipeRight?.();
          });
          return;
        }
        if (g.dx < -85 && callbacks.current.onSwipeLeft) {
          Animated.timing(translateX, {
            toValue: -500,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            callbacks.current.onSwipeLeft?.();
          });
          return;
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    }),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.underlay}>
        <Text style={[styles.underlayLabel, { color: colors.green }]}>✓ {rightLabel}</Text>
        <Text style={[styles.underlayLabel, { color: colors.amber }]}>{leftLabel}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden' },
  underlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  underlayLabel: { fontWeight: '800', fontSize: 13 },
});
