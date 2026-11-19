import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { createSession } from '@/db/repo';
import { formatDate, todayIso } from '@/lib/id';
import { parseMoneyInput } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';

import { Button, Field, Sheet } from './ui';

export function CreateSessionSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setBudget('1500');
      setError(null);
      setSaving(false);
    }
  }, [visible]);

  async function submit() {
    const budgetCentavos = parseMoneyInput(budget);
    if (budgetCentavos === null || budgetCentavos <= 0) {
      setError('Set a budget greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const id = await createSession({
        name: name.trim() || `Market · ${formatDate(todayIso())}`,
        budgetCentavos,
        occurredOn: todayIso(),
      });
      onCreated(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New market session"
      footer={<Button label={saving ? 'Starting…' : 'Start session'} onPress={submit} disabled={saving} />}
    >
      <Text style={[text.small, { lineHeight: 19 }]}>
        Every trip gets its own budget and item list. Nothing is shared between sessions except price history.
      </Text>
      <Field
        label="Session name"
        value={name}
        onChangeText={setName}
        placeholder={`Market · ${formatDate(todayIso())}`}
        autoFocus
      />
      <Field
        label="Budget"
        value={budget}
        onChangeText={setBudget}
        keyboardType="decimal-pad"
        placeholder="0.00"
        hint="The app tracks spend against this and warns you when you go over."
      />
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

export const sheetStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: space.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
