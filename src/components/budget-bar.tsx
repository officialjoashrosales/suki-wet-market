import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { budgetStatus, formatMoney, formatMoneyCompact } from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';

export function BudgetBar({
  budgetCentavos,
  spentCentavos,
  compact,
}: {
  budgetCentavos: number;
  spentCentavos: number;
  compact?: boolean;
}) {
  const status = budgetStatus(budgetCentavos, spentCentavos);
  const tone =
    status.state === 'over' ? colors.red : status.state === 'near' ? colors.amber : colors.green;
  const fill = Math.max(0, Math.min(100, status.usedPct));

  return (
    <View style={[styles.wrap, compact && { padding: space.md }]}>
      <View style={styles.topRow}>
        <View>
          <Text style={text.tiny}>REMAINING</Text>
          <Text style={[styles.remaining, { color: tone }]}>
            {formatMoney(Math.abs(status.remainingCentavos))}
            {status.state === 'over' ? ' over' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={text.tiny}>SPENT / BUDGET</Text>
          <Text style={styles.spent}>
            {formatMoneyCompact(spentCentavos)} / {formatMoneyCompact(budgetCentavos)}
          </Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fill}%`, backgroundColor: tone }]} />
      </View>

      <View style={styles.footerRow}>
        <Text style={[text.small, { fontSize: 12 }]}>
          {Math.round(status.usedPct)}% of budget used
        </Text>
        <Text style={[text.small, { fontSize: 12, color: tone }]}>
          {status.state === 'over'
            ? `Over by ${formatMoneyCompact(status.overageCentavos)}`
            : status.state === 'near'
              ? 'Close to the limit'
              : 'On track'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  remaining: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  spent: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  fill: { height: '100%', borderRadius: 4 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
