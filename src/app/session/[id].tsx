import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { BudgetBar } from '@/components/budget-bar';
import { CompleteItemSheet } from '@/components/complete-item-sheet';
import { DuplicateSessionSheet } from '@/components/duplicate-session-sheet';
import { SessionItemRow } from '@/components/session-item-row';
import { Button, Field, Loading, Screen, Sheet, Toast } from '@/components/ui';
import {
  deleteSession,
  getSession,
  listSessionItems,
  setSessionItemState,
  updateSession,
  type SessionItemView,
} from '@/db/repo';
import { formatDate, todayIso } from '@/lib/id';
import { parseMoneyInput } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [target, setTarget] = useState<SessionItemView | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const { data, loading } = useAsyncData(async () => {
    if (!id) return null;
    const session = await getSession(id);
    if (!session) return null;
    return { session, items: await listSessionItems(session.id) };
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
        <View style={{ padding: space.xl }}>
          <Text style={text.h2}>Session not found</Text>
          <Button label="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const { session, items } = data;
  const toBuy = items.filter((i) => i.state === 'to_buy');
  const bought = items.filter((i) => i.state === 'bought');
  const skipped = items.filter((i) => i.state === 'skipped');

  async function toggleClosed() {
    await updateSession(session.id, { status: session.status === 'closed' ? 'active' : 'closed' });
    invalidate();
    show(session.status === 'closed' ? 'Session reopened' : 'Session closed');
  }

  function confirmDelete() {
    Alert.alert('Delete session?', 'The item rows and prices recorded in this session are removed. Item history elsewhere is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(session.id);
          invalidate();
          router.back();
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
            {session.name}
          </Text>
          <Text style={text.small}>
            {formatDate(session.occurredOn)} · {session.status}
          </Text>
        </View>
        <Button label="Edit" compact variant="secondary" onPress={() => setEditOpen(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <BudgetBar budgetCentavos={session.budgetCentavos} spentCentavos={session.spentCentavos} compact />

        {items.length === 0 ? (
          <Text style={[text.small, { textAlign: 'center', paddingVertical: space.xl }]}>
            This session has no items.
          </Text>
        ) : (
          <View style={{ gap: space.sm }}>
            {toBuy.length > 0 ? <Text style={styles.label}>TO BUY · {toBuy.length}</Text> : null}
            {toBuy.map((item) => (
              <SessionItemRow
                key={item.id}
                view={item}
                onPress={() => setTarget(item)}
                onSkip={async () => {
                  await setSessionItemState(item.id, 'skipped');
                  invalidate();
                }}
              />
            ))}
            {skipped.length > 0 ? (
              <>
                <Text style={[styles.label, { marginTop: space.sm }]}>SKIPPED · {skipped.length}</Text>
                {skipped.map((item) => (
                  <SessionItemRow
                    key={item.id}
                    view={item}
                    onPress={async () => {
                      await setSessionItemState(item.id, 'to_buy');
                      invalidate();
                    }}
                    swipeable={false}
                  />
                ))}
              </>
            ) : null}
            {bought.length > 0 ? (
              <>
                <Text style={[styles.label, { marginTop: space.sm }]}>BOUGHT · {bought.length}</Text>
                {bought.map((item) => (
                  <SessionItemRow key={item.id} view={item} onPress={() => setTarget(item)} swipeable={false} />
                ))}
              </>
            ) : null}
          </View>
        )}

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button label="Duplicate this session" onPress={() => setDuplicateOpen(true)} />
          <Button
            label={session.status === 'closed' ? 'Reopen session' : 'Close session'}
            variant="secondary"
            onPress={toggleClosed}
          />
          <Button label="Delete session" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>

      <CompleteItemSheet
        target={target}
        visible={target !== null}
        onClose={() => setTarget(null)}
        onDone={() => {
          invalidate();
          show('Purchase updated');
        }}
      />

      <EditSessionSheet
        visible={editOpen}
        session={session}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          invalidate();
          show('Session updated');
        }}
      />

      <DuplicateSessionSheet
        source={session}
        visible={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
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

function EditSessionSheet({
  visible,
  session,
  onClose,
  onSaved,
}: {
  visible: boolean;
  session: { id: string; name: string; budgetCentavos: number; occurredOn: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(session.name);
  const [budget, setBudget] = useState(String(session.budgetCentavos / 100));
  const [date, setDate] = useState(session.occurredOn);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(session.name);
      setBudget(String(session.budgetCentavos / 100));
      setDate(session.occurredOn);
      setError(null);
    }
  }, [visible, session]);

  async function save() {
    const budgetCentavos = parseMoneyInput(budget);
    if (budgetCentavos === null) {
      setError('Budget is not a valid amount.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must look like 2026-11-18.');
      return;
    }
    await updateSession(session.id, {
      name: name.trim() || 'Market run',
      budgetCentavos,
      occurredOn: date || todayIso(),
    });
    onSaved();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit session"
      footer={<Button label="Save changes" onPress={save} />}
    >
      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="Budget"
        value={budget}
        onChangeText={setBudget}
        keyboardType="decimal-pad"
        hint="Lowering it below what you already spent simply shows the over-budget state."
      />
      <Field label="Market date" value={date} onChangeText={setDate} autoCapitalize="none" placeholder="YYYY-MM-DD" />
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
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
  label: { ...text.tiny },
});
