import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { DuplicateSessionSheet } from '@/components/duplicate-session-sheet';
import { Button, Card, Chip, EmptyState, Loading, PageHeader, Screen, Toast } from '@/components/ui';
import { listSessions, type SessionRecord } from '@/db/repo';
import { exportToShare, pickAndImport } from '@/lib/backup';
import { formatDate } from '@/lib/id';
import { budgetStatus, formatMoney, formatMoneyCompact } from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

export default function HistoryScreen() {
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [duplicateSource, setDuplicateSource] = useState<SessionRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading } = useAsyncData(() => listSessions());
  const sessions = data ?? [];

  async function onExport() {
    setBusy(true);
    try {
      show(await exportToShare());
    } catch (e) {
      show(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const result = await pickAndImport();
      if (result) {
        invalidate();
        show(result);
      }
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="History" subtitle="Past market runs and your data" />

      {loading && !data ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {sessions.length === 0 ? (
            <EmptyState
              emoji="📒"
              title="No sessions yet"
              body="Once you finish a market run, it lands here with the total spend and budget result."
            />
          ) : (
            sessions.map((s) => <SessionCard key={s.id} session={s} onDuplicate={() => setDuplicateSource(s)} />)
          )}

          <Text style={[styles.sectionLabel, { marginTop: space.lg }]}>YOUR DATA</Text>
          <Card style={{ gap: space.sm }}>
            <Text style={[text.small, { lineHeight: 19 }]}>
              Everything lives on this phone. A backup refreshes weekly inside app storage, but export a copy
              you control before switching phones.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button label={busy ? 'Working…' : 'Export backup'} variant="secondary" onPress={onExport} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Import backup" variant="secondary" onPress={onImport} disabled={busy} />
              </View>
            </View>
            <Text style={[text.small, { fontSize: 11 }]}>
              Import merges by record id, so importing the same file twice is safe.
            </Text>
          </Card>

          <Text style={[text.small, { fontSize: 11, textAlign: 'center', marginTop: space.md }]}>
            Suki · offline-first · no account, no cloud
          </Text>
        </ScrollView>
      )}

      <DuplicateSessionSheet
        source={duplicateSource}
        visible={duplicateSource !== null}
        onClose={() => setDuplicateSource(null)}
        onDone={() => {
          invalidate();
          show('Session duplicated');
          router.push('/');
        }}
      />

      <Toast message={message} />
    </Screen>
  );
}

function SessionCard({ session, onDuplicate }: { session: SessionRecord; onDuplicate: () => void }) {
  const status = budgetStatus(session.budgetCentavos, session.spentCentavos);
  const tone = status.state === 'over' ? colors.red : status.state === 'near' ? colors.amber : colors.green;

  return (
    <Card style={{ gap: space.sm }}>
      <Pressable onPress={() => router.push(`/session/${session.id}`)} style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[text.h3, { flex: 1 }]} numberOfLines={1}>
            {session.name}
          </Text>
          <Chip label={session.status === 'closed' ? 'closed' : 'open'} tone={session.status === 'closed' ? 'default' : 'green'} />
        </View>
        <Text style={[text.small, { fontSize: 12 }]}>
          {formatDate(session.occurredOn)} · {session.itemCount} item{session.itemCount === 1 ? '' : 's'}
        </Text>
      </Pressable>

      <View style={styles.spendRow}>
        <View>
          <Text style={text.tiny}>SPENT</Text>
          <Text style={[text.h3, { color: colors.text }]}>{formatMoney(session.spentCentavos)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={text.tiny}>BUDGET</Text>
          <Text style={[text.h3, { color: colors.muted }]}>{formatMoneyCompact(session.budgetCentavos)}</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(0, Math.min(100, status.usedPct))}%`, backgroundColor: tone },
          ]}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[text.small, { fontSize: 12, color: tone }]}>
          {status.state === 'over'
            ? `${formatMoneyCompact(status.overageCentavos)} over budget`
            : `${formatMoneyCompact(status.remainingCentavos)} left`}
        </Text>
        <Button label="Duplicate" compact variant="secondary" onPress={onDuplicate} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: 40, gap: space.sm },
  sectionLabel: { ...text.tiny },
  spendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.sm },
});
