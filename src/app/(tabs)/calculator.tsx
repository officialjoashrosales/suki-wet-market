import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button, Card, Chip, Field, PageHeader, Screen, Sheet, Toast } from '@/components/ui';
import { getActiveSession, listSessionItems, updateSessionItemQty, type SessionItemView } from '@/db/repo';
import {
  costForWeight,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatWeight,
  fractionLabel,
  parseDecimalInput,
  parseMoneyInput,
  weightForBudget,
} from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

type Mode = 'budget' | 'weight';
type Unit = 'kg' | 'g' | 'L' | 'pc';

const UNIT_INFO: Record<Unit, { base: 'g' | 'mL' | 'pc'; qty: number; suffix: string }> = {
  kg: { base: 'g', qty: 1000, suffix: 'kg' },
  g: { base: 'g', qty: 1, suffix: 'g' },
  L: { base: 'mL', qty: 1000, suffix: 'L' },
  pc: { base: 'pc', qty: 1, suffix: 'pc' },
};

export default function CalculatorScreen() {
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [price, setPrice] = useState('100');
  const [unit, setUnit] = useState<Unit>('kg');
  const [mode, setMode] = useState<Mode>('budget');
  const [spend, setSpend] = useState('50');
  const [weight, setWeight] = useState('0.75');
  const [applyOpen, setApplyOpen] = useState(false);

  const info = UNIT_INFO[unit];
  const priceCentavos = parseMoneyInput(price);

  const result = useMemo(() => {
    if (priceCentavos === null || priceCentavos <= 0) return null;
    if (mode === 'budget') {
      const spendCentavos = parseMoneyInput(spend);
      if (spendCentavos === null) return null;
      const baseQty = weightForBudget(spendCentavos, priceCentavos, info.qty);
      if (baseQty === null) return null;
      return {
        baseQty,
        amountCentavos: spendCentavos,
        fraction: fractionLabel(baseQty, info.qty, info.suffix),
        perUnit: priceCentavos,
      };
    }
    const qty = parseDecimalInput(weight);
    if (qty === null) return null;
    const baseQty = Math.round(qty * info.qty);
    const amount = costForWeight(priceCentavos, baseQty, info.qty);
    if (amount === null) return null;
    return {
      baseQty,
      amountCentavos: amount,
      fraction: fractionLabel(baseQty, info.qty, info.suffix),
      perUnit: priceCentavos,
    };
  }, [priceCentavos, mode, spend, weight, info]);

  const { data: sessionData } = useAsyncData(async () => {
    const session = await getActiveSession();
    if (!session) return { session: null, items: [] as SessionItemView[] };
    return { session, items: (await listSessionItems(session.id)).filter((i) => i.state === 'to_buy') };
  });

  async function apply(item: SessionItemView) {
    if (!result) return;
    await updateSessionItemQty(item.id, result.baseQty, null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidate();
    setApplyOpen(false);
    show(`Planned ${formatWeight(result.baseQty, info.base)} of ${item.name}`);
  }

  const ratio = result ? result.baseQty / info.qty : 0;
  const fill = Math.max(0, Math.min(1, ratio));

  return (
    <Screen>
      <PageHeader title="Scale" subtitle="Market math, without the mental arithmetic" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: space.md }}>
          <Text style={text.tiny}>VENDOR PRICE</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="100" />
            </View>
            <Text style={[text.small, { paddingBottom: 15 }]}>per</Text>
            <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 6 }}>
              {(['kg', 'g', 'L', 'pc'] as Unit[]).map((u) => (
                <Chip key={u} label={`1 ${u}`} active={unit === u} onPress={() => setUnit(u)} />
              ))}
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip label="Spend ₱ → weight" active={mode === 'budget'} onPress={() => setMode('budget')} />
          <Chip label="Weight → cost" active={mode === 'weight'} onPress={() => setMode('weight')} />
        </View>

        {mode === 'budget' ? (
          <Card style={{ gap: space.md }}>
            <Field
              label="Amount you want to spend"
              value={spend}
              onChangeText={setSpend}
              keyboardType="decimal-pad"
              placeholder="50"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['20', '50', '100', '200'].map((amount) => (
                <Chip key={amount} label={formatMoney(Number(amount) * 100)} active={spend === amount} onPress={() => setSpend(amount)} />
              ))}
            </View>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <Field
              label={`Weight on the scale (${unit})`}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="0.75"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {unit === 'pc'
                ? ['1', '2', '3', '6'].map((v) => (
                    <Chip key={v} label={`${v} pc`} active={weight === v} onPress={() => setWeight(v)} />
                  ))
                : unit === 'g'
                  ? ['250', '500', '750', '1000'].map((v) => (
                      <Chip key={v} label={`${v} g`} active={weight === v} onPress={() => setWeight(v)} />
                    ))
                  : ['0.25', '0.5', '0.75', '1'].map((v) => (
                      <Chip key={v} label={`${v} ${unit}`} active={weight === v} onPress={() => setWeight(v)} />
                    ))}
            </View>
          </Card>
        )}

        <View style={styles.resultCard}>
          <Text style={[text.tiny, { color: colors.faint }]}>
            {mode === 'budget' ? 'YOU SHOULD RECEIVE' : 'YOU SHOULD PAY'}
          </Text>
          {result ? (
            <>
              <Text style={styles.big}>
                {mode === 'budget'
                  ? result.fraction ?? formatWeight(result.baseQty, info.base)
                  : formatMoney(result.amountCentavos)}
              </Text>
              <Text style={[text.small, { marginTop: 2 }]}>
                {mode === 'budget'
                  ? `${formatWeight(result.baseQty, info.base)} for ${formatMoney(result.amountCentavos)}`
                  : `${formatWeight(result.baseQty, info.base)} at ${formatMoneyCompact(result.perUnit)} per ${unit}`}
              </Text>

              <View style={styles.gaugeWrap}>
                <View style={styles.gaugeTrack}>
                  <View style={[styles.gaugeFill, { width: `${fill * 100}%` }]} />
                  {[0.25, 0.5, 0.75].map((t) => (
                    <View key={t} style={[styles.tick, { left: `${t * 100}%` }]} />
                  ))}
                </View>
                <View style={styles.gaugeLabels}>
                  <Text style={styles.gaugeLabel}>0</Text>
                  <Text style={styles.gaugeLabel}>{unit === 'pc' ? `1 ${unit}` : `1 ${unit}`}</Text>
                </View>
              </View>

              {ratio > 1 ? (
                <Text style={[text.small, { fontSize: 12, marginTop: 2 }]}>
                  That is {formatNumber(ratio, 2)}× one {unit}.
                </Text>
              ) : null}

              {sessionData?.session && sessionData.items.length > 0 ? (
                <Button
                  label="Apply to a list item"
                  variant="secondary"
                  compact
                  onPress={() => setApplyOpen(true)}
                  style={{ alignSelf: 'flex-start', marginTop: space.sm }}
                />
              ) : null}
            </>
          ) : (
            <Text style={[styles.big, { color: colors.faint }]}>—</Text>
          )}
        </View>

        <Card style={{ gap: 6 }}>
          <Text style={text.tiny}>HOW IT WORKS</Text>
          <Text style={[text.small, { lineHeight: 19 }]}>
            {formatMoneyCompact(priceCentavos ?? 0)} per 1 {unit} means{' '}
            {priceCentavos
              ? `${formatMoneyCompact(Math.round(priceCentavos / 2))} buys half, ${formatMoneyCompact(
                  Math.round(priceCentavos / 5),
                )} buys one fifth.`
              : 'enter a price above.'}
          </Text>
          <Text style={[text.small, { fontSize: 12 }]}>
            List price per unit, not the total of your purchase — the app handles the division.
          </Text>
        </Card>
      </ScrollView>

      <Sheet
        visible={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Apply to list item"
      >
        <Text style={[text.small, { lineHeight: 19 }]}>
          Sets the planned quantity on the item. Nothing is marked bought and no budget is deducted yet.
        </Text>
        {sessionData?.items.map((item) => (
          <Pressable key={item.id} onPress={() => apply(item)} style={styles.applyRow}>
            <View style={{ flex: 1 }}>
              <Text style={text.h3}>{item.name}</Text>
              <Text style={[text.small, { fontSize: 12 }]}>
                {item.baseUnit ? `measured in ${item.baseUnit}` : 'no unit set'}
              </Text>
            </View>
            <Text style={{ color: colors.green, fontWeight: '800' }}>Apply</Text>
          </Pressable>
        ))}
      </Sheet>

      <Toast message={message} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: 32, gap: space.md },
  resultCard: {
    backgroundColor: colors.greenDim,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(53,208,127,0.35)',
    padding: space.lg,
  },
  big: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.8, marginTop: 4 },
  gaugeWrap: { marginTop: space.md, gap: 4 },
  gaugeTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  gaugeFill: { height: '100%', backgroundColor: colors.green, borderRadius: 6 },
  tick: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabel: { fontSize: 10, color: colors.faint, fontWeight: '700' },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
