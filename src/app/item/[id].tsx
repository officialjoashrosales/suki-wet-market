import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PriceBadge } from '@/components/price-badge';
import { Button, Card, Chip, Field, Loading, Screen, Sheet, Toast } from '@/components/ui';
import {
  addItemUnit,
  deleteItem,
  getItem,
  getItemHistory,
  listUnits,
  setItemArchived,
  type BaseUnit,
  type EntryPoint,
  type ItemRecord,
  type UnitRecord,
} from '@/db/repo';
import { formatDate, formatDateTime } from '@/lib/id';
import { quantityLabel, unitPriceLabel } from '@/lib/labels';
import { comparePrice, formatMoney } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [unitOpen, setUnitOpen] = useState(false);

  const { data, loading } = useAsyncData(async () => {
    if (!id) return null;
    const item = await getItem(id);
    if (!item) return null;
    const [units, history] = await Promise.all([listUnits(id), getItemHistory(id)]);
    return { item, units, history };
  }, [id]);

  if (loading && !data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Loading />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ padding: space.xl, gap: space.md }}>
          <Text style={text.h2}>Item not found</Text>
          <Button label="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const { item, units, history } = data;
  const last = history[0] ?? null;
  const lowest = lowestEntry(history);

  async function archiveToggle() {
    await setItemArchived(item.id, !item.archivedAt);
    invalidate();
    show(item.archivedAt ? 'Item restored' : 'Item archived');
  }

  function confirmDelete() {
    Alert.alert('Delete item?', 'Only possible when the item has no price history and is not on any list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteItem(item.id);
            invalidate();
            router.back();
          } catch (e) {
            Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: colors.muted, fontSize: 26 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={text.h2} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={text.small}>
            {item.category} · {unitSummary(item, units)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <StatCard label="LAST" value={last ? unitPriceLabel(last, item.baseUnit) ?? formatMoney(last.totalCentavos) : '—'} sub={last ? formatDate(last.purchasedAt) : ''} />
          <StatCard
            label="LOWEST"
            value={lowest ? unitPriceLabel(lowest, item.baseUnit) ?? formatMoney(lowest.totalCentavos) : '—'}
            sub={lowest ? formatDate(lowest.purchasedAt) : ''}
          />
          <StatCard label="BOUGHT" value={String(history.length)} sub="times" />
        </View>

        <Text style={styles.label}>UNITS</Text>
        <Card style={{ gap: space.sm }}>
          {units.length === 0 ? (
            <Text style={[text.small, { lineHeight: 19 }]}>
              No unit yet — totals are stored, but prices are not compared per kilo. Add a unit to unlock
              cheaper/pricier badges.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {units.map((u) => (
                <Chip
                  key={u.id}
                  label={`${u.label}${u.qtyInBase ? ` · ${u.qtyInBase} ${item.baseUnit ?? 'base'}` : ''}${u.verified ? '' : ' ⚠'}`}
                  tone={u.verified ? 'green' : 'amber'}
                />
              ))}
            </View>
          )}
          <Button label="+ Add unit" compact variant="secondary" onPress={() => setUnitOpen(true)} />
        </Card>

        <Text style={styles.label}>PRICE HISTORY</Text>
        {history.length === 0 ? (
          <Card>
            <Text style={text.small}>No purchases recorded yet. Complete this item in a market session.</Text>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {history.map((entry, index) => {
              const previous = history[index + 1] ?? null;
              const comparison = previous ? comparePrice(entry, previous) : null;
              return (
                <Card key={entry.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={text.h3}>{formatMoney(entry.totalCentavos)}</Text>
                    <Text style={[text.small, { fontSize: 12 }]}>{formatDateTime(entry.purchasedAt)}</Text>
                  </View>
                  <Text style={[text.small, { fontSize: 12 }]}>
                    {unitPriceLabel(entry, item.baseUnit) ?? 'no unit price'}
                    {quantityLabel(entry, item.baseUnit) ? ` · ${quantityLabel(entry, item.baseUnit)}` : ''}
                    {entry.verified ? '' : ' · unverified conversion'}
                  </Text>
                  <PriceBadge comparison={comparison} compact />
                </Card>
              );
            })}
          </View>
        )}

        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button
            label={item.archivedAt ? 'Restore item' : 'Archive item'}
            variant="secondary"
            onPress={archiveToggle}
          />
          <Button label="Delete item" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>

      <AddUnitSheet
        visible={unitOpen}
        item={item}
        onClose={() => setUnitOpen(false)}
        onAdded={() => {
          invalidate();
          show('Unit added');
        }}
      />

      <Toast message={message} />
    </Screen>
  );
}

function AddUnitSheet({
  visible,
  item,
  onClose,
  onAdded,
}: {
  visible: boolean;
  item: ItemRecord;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [factor, setFactor] = useState('');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setLabel('');
      setFactor('');
      setError(null);
    }
  }, [visible]);

  const base: BaseUnit = item.baseUnit ?? 'g';
  const baseLabel = base === 'g' ? 'g' : base === 'mL' ? 'mL' : 'pc';

  async function submit() {
    if (!label.trim()) {
      setError('Name this unit, e.g. “pack” or “tali”.');
      return;
    }
    const value = factor.trim() === '' ? null : Number(factor);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      setError('Conversion must be a positive number.');
      return;
    }
    await addItemUnit(item.id, { label, qtyInBase: value });
    onAdded();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add a sell unit"
      footer={<Button label="Add unit" onPress={submit} />}
    >
      <Text style={[text.small, { lineHeight: 19 }]}>
        Use the unit the vendor quotes in. Leave the conversion blank if you do not know it — comparisons will
        be marked as estimates.
      </Text>
      <Field label="Unit label" value={label} onChangeText={setLabel} placeholder="pack, tali, 500g tray" />
      <Field
        label={`1 unit equals how many ${baseLabel}?`}
        value={factor}
        onChangeText={setFactor}
        keyboardType="decimal-pad"
        placeholder={base === 'pc' ? '1' : '500'}
        hint={`Base unit for this item: ${baseLabel}`}
      />
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: space.sm }}>
      <Text style={text.tiny}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.faint, fontSize: 10 }}>{sub}</Text> : null}
    </Card>
  );
}

function unitSummary(item: ItemRecord, units: UnitRecord[]): string {
  if (units.length === 0) return 'no unit';
  return units.map((u) => u.label).join(', ');
}

function lowestEntry(history: EntryPoint[]): EntryPoint | null {
  let best: EntryPoint | null = null;
  let bestValue = Number.POSITIVE_INFINITY;
  for (const entry of history) {
    if (entry.unitPriceCentavos === null || entry.qtyInBase === null || entry.qtyInBase <= 0) continue;
    const perBase = entry.unitPriceCentavos / entry.qtyInBase;
    if (perBase < bestValue) {
      bestValue = perBase;
      best = entry;
    }
  }
  return best;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 40, gap: space.md },
  label: { ...text.tiny, marginTop: space.xs },
});
