import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Comparison } from '@/lib/pricing';
import { colors, radius } from '@/lib/theme';

export function PriceBadge({ comparison, compact }: { comparison: Comparison | null; compact?: boolean }) {
  if (!comparison || comparison.state === 'none') return null;

  const pct = Math.abs(Math.round(comparison.deltaPct));
  const same = pct === 0;
  const cheaper = comparison.deltaCentavos < 0;

  const tone = same ? colors.muted : cheaper ? colors.green : colors.red;
  const bg = same ? colors.surfaceAlt : cheaper ? colors.greenDim : colors.redDim;
  const arrow = same ? '=' : cheaper ? '↓' : '↑';
  const label = same ? 'same as last time' : `${pct}% ${cheaper ? 'cheaper' : 'pricier'}`;

  return (
    <View style={[styles.badge, { backgroundColor: bg }, compact && styles.compact]}>
      <Text style={[styles.label, { color: tone }]}>
        {arrow} {label}
        {comparison.state === 'partial' ? ' · est.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  compact: { paddingHorizontal: 6, paddingVertical: 2 },
  label: { fontSize: 12, fontWeight: '700' },
});
