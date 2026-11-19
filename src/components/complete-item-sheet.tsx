import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { completeSessionItem, listUnits, type SessionItemView, type UnitRecord } from '@/db/repo';
import { formatMoney, formatPerBase, parseDecimalInput, parseMoneyInput, pricePerBase } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';

import { Button, Chip, Field, Sheet } from './ui';

export function CompleteItemSheet({
  target,
  visible,
  onClose,
  onDone,
}: {
  target: SessionItemView | null;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [total, setTotal] = useState('');
  const [qty, setQty] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !target) return;
    setError(null);
    setSaving(false);
    setTotal(target.entry ? String(target.entry.totalCentavos / 100) : '');
    setQty('');
    setUnitId(target.plannedUnitId ?? null);
    listUnits(target.itemId).then((next) => {
      setUnits(next);
      const preferred =
        next.find((u) => u.id === target.plannedUnitId) ??
        next.find((u) => u.isDefault) ??
        next[0] ??
        null;
      setUnitId(preferred?.id ?? null);
      if (target.entry?.qtyInBase && preferred?.qtyInBase) {
        setQty(String(round(target.entry.qtyInBase / preferred.qtyInBase)));
      }
    });
  }, [visible, target]);

  const selectedUnit = useMemo(() => units.find((u) => u.id === unitId) ?? null, [units, unitId]);
  const totalCentavos = parseMoneyInput(total);
  const qtyValue = parseDecimalInput(qty);
  const qtyInBase =
    qtyValue !== null && selectedUnit?.qtyInBase ? Math.round(qtyValue * selectedUnit.qtyInBase) : null;

  // Store what was paid for the quantity actually bought; readers derive ₱/kg from it.
  const unitPriceCentavos =
    totalCentavos !== null && qtyInBase !== null && qtyInBase > 0 ? totalCentavos : null;

  const perBase =
    unitPriceCentavos !== null && qtyInBase !== null && qtyInBase > 0
      ? pricePerBase(unitPriceCentavos, qtyInBase)
      : null;

  async function save() {
    if (!target) return;
    if (totalCentavos === null || totalCentavos <= 0) {
      setError('Enter the total amount paid.');
      return;
    }
    if (qty.trim() !== '' && (qtyValue === null || qtyValue <= 0)) {
      setError('Weight or quantity must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await completeSessionItem(target.id, {
        totalCentavos,
        qtyInBase,
        itemUnitId: selectedUnit?.id ?? null,
        unitPriceCentavos,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={target.entry ? `Edit ${target.name}` : `Bought ${target.name}`}
      footer={
        <Button
          label={saving ? 'Saving…' : target.entry ? 'Update purchase' : 'Mark as bought'}
          onPress={save}
          disabled={saving}
        />
      }
    >
      <Field
        label="Total paid"
        value={total}
        onChangeText={setTotal}
        keyboardType="decimal-pad"
        placeholder="0.00"
        autoFocus
        hint="The amount you actually handed to the vendor."
      />

      {units.length > 0 ? (
        <>
          <View style={{ gap: 6 }}>
            <Text style={text.tiny}>UNIT</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {units.map((u) => (
                <Chip
                  key={u.id}
                  label={u.label}
                  active={unitId === u.id}
                  onPress={() => {
                    setUnitId(u.id);
                    setQty('');
                  }}
                />
              ))}
              <Chip label="No weight" active={unitId === null} onPress={() => setUnitId(null)} />
            </View>
          </View>

          {selectedUnit ? (
            <Field
              label={`Weight / quantity (${selectedUnit.label})`}
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              placeholder={selectedUnit.label === 'pc' ? 'e.g. 2' : 'e.g. 0.5'}
              hint="Optional — but it unlocks price-per-kg comparisons."
            />
          ) : null}
        </>
      ) : (
        <Text style={[text.small, { lineHeight: 19 }]}>
          This item has no unit yet, so only the total is recorded. Add a unit from the Items tab to compare
          prices per kilo later.
        </Text>
      )}

      {perBase !== null && target.baseUnit ? (
        <View style={styles.preview}>
          <Text style={text.tiny}>PRICE</Text>
          <Text style={[text.h3, { marginTop: 2 }]}>{formatPerBase(perBase, target.baseUnit)}</Text>
          {target.previous ? (
            <Text style={[text.small, { fontSize: 12 }]}>Previous was {formatMoney(target.previous.totalCentavos)}</Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
