import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Swipe and double-tap gestures for one board card.
 *
 * - Swipe right → onSwipeRight (pass/skip)
 * - Swipe left → onSwipeLeft (open the purchase editor)
 * - Double-tap anywhere on the card's tap area → onDoubleTap (mark bought)
 *
 * The board card is much larger than a list row, so it intentionally keeps a
 * bigger threshold than SwipeRow (85px) to avoid accidental actions.
 */
export const BOARD_SWIPE_THRESHOLD = 120;

type Responder = ReturnType<typeof PanResponder.create>;
const EMPTY_RESPONDER: Responder = PanResponder.create({});

export function useBoardSwipe({
  onSwipeRight,
  onSwipeLeft,
  onDoubleTap,
  threshold = BOARD_SWIPE_THRESHOLD,
  disabled = false,
}: {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onDoubleTap: () => void;
  threshold?: number;
  disabled?: boolean;
}) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [panResponder, setPanResponder] = useState<Responder | null>(null);
  const lastTapAt = useRef(0);

  // Callbacks from BoardScreen are stable, so this rebuilds once per mount
  // instead of on every render (which caused an infinite update loop).
  useEffect(() => {
    const springBack = () => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    };

    const animateOut = (toValue: number, done: () => void) => {
      Animated.timing(translateX, {
        toValue,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        translateX.setValue(0);
        done();
      });
    };

    setPanResponder(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (disabled) return false;
          return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
        },
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(Math.max(-threshold, Math.min(threshold, gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          if (disabled) return;
          if (gesture.dx > threshold) {
            animateOut(threshold + 200, onSwipeRight);
            return;
          }
          if (gesture.dx < -threshold) {
            animateOut(-threshold - 200, onSwipeLeft);
            return;
          }
          springBack();
        },
        onPanResponderTerminate: springBack,
      }),
    );
  }, [onSwipeRight, onSwipeLeft, threshold, disabled, translateX]);

  // Attached to a TouchableWithoutFeedback around the card's tap area so the
  // action buttons keep their own presses.
  const onTap = () => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastTapAt.current < 400) {
      lastTapAt.current = 0;
      onDoubleTap();
    } else {
      lastTapAt.current = now;
    }
  };

  return { translateX, panResponder: panResponder ?? EMPTY_RESPONDER, onTap };
}
