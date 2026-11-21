import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, text } from '@/lib/theme';

export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={text.h1}>{title}</Text>
        {subtitle ? <Text style={[text.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  compact,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  compact?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.green, fg: '#072315', border: colors.green },
    secondary: { bg: colors.raised, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.muted, border: 'transparent' },
    danger: { bg: colors.redDim, fg: colors.red, border: colors.red },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: palette.fg }, compact && { fontSize: 13 }]}>
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone = 'default',
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'green' | 'amber' | 'red';
  disabled?: boolean;
}) {
  const tones = {
    default: colors.surfaceAlt,
    green: colors.greenDim,
    amber: colors.amberDim,
    red: colors.redDim,
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? colors.green : tones, borderColor: active ? colors.green : colors.border },
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Text style={[styles.chipLabel, active && { color: '#072315' }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={text.tiny}>{label.toUpperCase()}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 120, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint ? <Text style={[text.small, { fontSize: 12 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={text.h2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.muted, fontSize: 22 }}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text style={[text.h2, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[text.small, { textAlign: 'center', maxWidth: 280, lineHeight: 19 }]}>{body}</Text>
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
      <ActivityIndicator color={colors.green} />
      {label ? <Text style={text.small}>{label}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={{ color: '#072315', fontWeight: '700' }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: space.md,
  },
  sheetFooter: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 64,
    paddingHorizontal: space.xl,
  },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: colors.green,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
});
