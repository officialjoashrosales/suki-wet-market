import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { duplicateSession, type SessionRecord } from '@/db/repo';
import { formatDate, todayIso } from '@/lib/id';
import { parseMoneyInput } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';

import { Button, Field, Sheet } from './ui';

export function DuplicateSessionSheet({
  source,
  visible,
  onClose,
  onDone,
}: {
  source: SessionRecord | null;
  visible: boolean;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [includeBought, setIncludeBought] = useState(true);
  const [copyQty, setCopyQty] = useState(true);
  const [budget, setBudget] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !source) return;
    setIncludeBought(true);
    setCopyQty(true);
    setBudget(String(source.budgetCentavos / 100));
    setDate(todayIso());
    setError(null);
    setSaving(false);
  }, [visible, source]);

  async function submit() {
    if (!source) return;
    const budgetCentavos = parseMoneyInput(budget);
    if (budgetCentavos === null || budgetCentavos <= 0) {
      setError('Budget must be greater than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must look like 2026-11-18.');
      return;
    }
    setSaving(true);
    try {
      const id = await duplicateSession(source.id, {
        includeBought,
        copyQty,
        budgetCentavos,
        occurredOn: date,
      });
      onDone(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!source) return null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Duplicate session"
      footer={<Button label={saving ? 'Copying…' : 'Create copy'} onPress={submit} disabled={saving} />}
    >
      <Text style={[text.small, { lineHeight: 19 }]}>
        Copies the item list of “{source.name}” from {formatDate(source.occurredOn)}. Prices and purchased
        state start fresh, but last-time prices stay visible for comparison.
      </Text>

      <OptionRow
        label="Include items already bought"
        hint="Off = copy only the items you did not buy."
        value={includeBought}
        onChange={setIncludeBought}
      />
      <OptionRow
        label="Copy planned quantities"
        hint="Off = every copied item starts without a target qty."
        value={copyQty}
        onChange={setCopyQty}
      />

      <Field
        label="Budget for the new session"
        value={budget}
        onChangeText={setBudget}
        keyboardType="decimal-pad"
      />
      <Field
        label="Market date"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

function OptionRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.row}>
      <View style={[styles.box, value && { backgroundColor: colors.green, borderColor: colors.green }]}>
        <Text style={{ color: value ? '#072315' : 'transparent', fontWeight: '900' }}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.h3}>{label}</Text>
        <Text style={[text.small, { fontSize: 12 }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
