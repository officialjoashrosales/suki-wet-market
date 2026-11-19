import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionItemView } from '@/db/repo';
import { quantityLabel, unitPriceLabel } from '@/lib/labels';
import { formatMoney, formatPerBase } from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';

import { PriceBadge } from './price-badge';
import { SwipeRow } from './swipe-row';

export function SessionItemRow({
  view,
  onPress,
  onComplete,
  onSkip,
  swipeable = true,
}: {
  view: SessionItemView;
  onPress: () => void;
  onComplete?: () => void;
  onSkip?: () => void;
  swipeable?: boolean;
}) {
  const { entry, previous, baseUnit } = view;
  const lastLabel = unitPriceLabel(previous, baseUnit);
  const paidUnit = unitPriceLabel(entry, baseUnit);
  const bought = view.state === 'bought';
  const skipped = view.state === 'skipped';

  return (
    <SwipeRow
      disabled={!swipeable || skipped}
      onSwipeRight={onComplete ?? onPress}
      onSwipeLeft={onSkip}
      rightLabel="Bought"
    >
      <Pressable onPress={onPress} style={styles.row}>
        <View style={[styles.inner, skipped && { opacity: 0.55 }]}>
          <View style={styles.main}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[text.h3, bought && { color: colors.text }]} numberOfLines={1}>
              {view.name}
            </Text>
            {skipped ? (
              <View style={styles.skippedPill}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amber }}>SKIPPED</Text>
              </View>
            ) : null}
            {bought ? (
              <View style={styles.boughtPill}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.green }}>BOUGHT</Text>
              </View>
            ) : null}
          </View>

          {bought && entry ? (
            <View style={{ gap: 3, marginTop: 3 }}>
              <Text style={[text.small, { color: colors.text }]}>
                {formatMoney(entry.totalCentavos)}
                {quantityLabel(entry, baseUnit) ? `  ·  ${quantityLabel(entry, baseUnit)}` : ''}
                {paidUnit ? `  ·  ${paidUnit}` : ''}
              </Text>
              <PriceBadge comparison={view.comparison} compact />
            </View>
          ) : (
            <View style={{ gap: 2, marginTop: 3 }}>
              <Text style={[text.small, { fontSize: 12 }]} numberOfLines={1}>
                {formatPlanned(view) ? `${formatPlanned(view)}  ·  ` : ''}
                {lastLabel ? `last ${lastLabel}` : 'no price history yet'}
              </Text>
              {view.lowestPerBase !== null && baseUnit ? (
                <Text style={[text.small, { fontSize: 11, color: colors.faint }]}>
                  lowest {unitPriceLabelLowest(view)}
                  {view.lowestVerified ? '' : ' (unverified)'}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {bought && entry ? (
            <Text style={styles.amount}>{formatMoney(entry.totalCentavos)}</Text>
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </View>
        </View>
      </Pressable>
    </SwipeRow>
  );
}

function formatPlanned(view: SessionItemView): string | null {
  if (view.plannedQty === null || view.plannedQty <= 0) return null;
  if (view.baseUnit) {
    const qty = view.plannedQty;
    if (view.baseUnit === 'g' && qty >= 1000) return `${Math.round((qty / 1000) * 100) / 100} kg`;
    return `${qty} ${view.baseUnit}`;
  }
  return view.plannedUnitLabel ? `${view.plannedQty} ${view.plannedUnitLabel}` : `${view.plannedQty}`;
}

function unitPriceLabelLowest(view: SessionItemView): string {
  if (view.lowestPerBase === null || !view.baseUnit) return '—';
  return formatPerBase(view.lowestPerBase, view.baseUnit);
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  main: { flex: 1 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  chevron: { color: colors.faint, fontSize: 24, lineHeight: 24, paddingRight: 2 },
  boughtPill: {
    backgroundColor: colors.greenDim,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  skippedPill: {
    backgroundColor: colors.amberDim,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
