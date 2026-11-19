import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AddItemsSheet } from '@/components/add-items-sheet';
import { BudgetBar } from '@/components/budget-bar';
import { CompleteItemSheet } from '@/components/complete-item-sheet';
import { CreateSessionSheet } from '@/components/create-session-sheet';
import { PriceBadge } from '@/components/price-badge';
import { SessionItemRow } from '@/components/session-item-row';
import { Button, Chip, EmptyState, Loading, PageHeader, Screen, Toast } from '@/components/ui';
import {
  closeSession,
  getActiveSession,
  listSessionItems,
  setSessionItemState,
  type SessionItemView,
} from '@/db/repo';
import { formatDate } from '@/lib/id';
import { unitPriceLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

type ViewMode = 'list' | 'board';

export default function MarketScreen() {
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [mode, setMode] = useState<ViewMode>('list');
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<SessionItemView | null>(null);

  const { data, loading } = useAsyncData(async () => {
    const session = await getActiveSession();
    if (!session) return { session: null, items: [] as SessionItemView[] };
    return { session, items: await listSessionItems(session.id) };
  });

  const session = data?.session ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);

  const toBuy = useMemo(() => items.filter((i) => i.state === 'to_buy'), [items]);
  const bought = useMemo(() => items.filter((i) => i.state === 'bought'), [items]);
  const skipped = useMemo(() => items.filter((i) => i.state === 'skipped'), [items]);

  async function skip(item: SessionItemView) {
    await setSessionItemState(item.id, 'skipped');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    invalidate();
    show(`${item.name} skipped`);
  }

  async function restore(item: SessionItemView, state: 'to_buy') {
    await setSessionItemState(item.id, state);
    invalidate();
    show(`${item.name} restored`);
  }

  async function finishSession() {
    if (!session) return;
    await closeSession(session.id);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidate();
    show('Session closed');
  }

  if (loading && !data) return <Screen><Loading label="Opening your market list…" /></Screen>;

  return (
    <Screen>
      <PageHeader
        title="Suki"
        subtitle={
          session
            ? session.name.includes(formatDate(session.occurredOn))
              ? session.name
              : `${session.name} · ${formatDate(session.occurredOn)}`
            : 'Wet market prices, remembered'
        }
        right={
          session ? (
            <Button
              label="Edit"
              variant="secondary"
              compact
              onPress={() => router.push(`/session/${session.id}`)}
            />
          ) : undefined
        }
      />

      {!session ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <EmptyState
            emoji="🧺"
            title="No market session yet"
            body="Start a session, set a budget, and build your list. Every price you pay is remembered for the next trip."
            action={<Button label="Start a session" onPress={() => setCreateOpen(true)} />}
          />
          <View style={{ gap: space.sm }}>
            <MiniStep n="1" title="Build your list" body="Pick from items you already buy, or create new ones." />
            <MiniStep n="2" title="Check prices at the stall" body="See last time and lowest price before you pay." />
            <MiniStep n="3" title="Swipe when bought" body="The budget updates instantly, over-budget included." />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <BudgetBar budgetCentavos={session.budgetCentavos} spentCentavos={session.spentCentavos} />

          <View style={styles.toolbar}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="List" active={mode === 'list'} onPress={() => setMode('list')} />
              <Chip label="Board" active={mode === 'board'} onPress={() => setMode('board')} />
            </View>
            <Button label="+ Add" compact onPress={() => setAddOpen(true)} />
          </View>

          {items.length === 0 ? (
            <EmptyState
              emoji="📝"
              title="Your list is empty"
              body="Add items to this session. Prices from your previous trips appear automatically."
              action={<Button label="Add items" onPress={() => setAddOpen(true)} />}
            />
          ) : mode === 'list' ? (
            <View style={{ gap: space.sm }}>
              {toBuy.length > 0 ? <Text style={styles.sectionLabel}>TO BUY · {toBuy.length}</Text> : null}
              {toBuy.map((item) => (
                <SessionItemRow
                  key={item.id}
                  view={item}
                  onPress={() => setTarget(item)}
                  onSkip={() => skip(item)}
                />
              ))}

              {skipped.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: space.md }]}>SKIPPED · {skipped.length}</Text>
                  {skipped.map((item) => (
                    <SessionItemRow
                      key={item.id}
                      view={item}
                      onPress={() => restore(item, 'to_buy')}
                      swipeable={false}
                    />
                  ))}
                </>
              ) : null}

              {bought.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: space.md }]}>
                    BOUGHT · {bought.length} · {formatMoney(session.spentCentavos)}
                  </Text>
                  {bought.map((item) => (
                    <SessionItemRow
                      key={item.id}
                      view={item}
                      swipeable={false}
                      onPress={() => setTarget(item)}
                    />
                  ))}
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.board}>
              <View style={styles.column}>
                <Text style={styles.columnTitle}>TO BUY · {toBuy.length}</Text>
                {toBuy.length === 0 ? <Text style={styles.columnEmpty}>All done</Text> : null}
                {toBuy.map((item) => (
                  <BoardCard key={item.id} item={item} onPress={() => setTarget(item)} />
                ))}
              </View>
              <View style={styles.column}>
                <Text style={styles.columnTitle}>BOUGHT · {bought.length}</Text>
                {bought.length === 0 ? <Text style={styles.columnEmpty}>Swipe an item to complete it</Text> : null}
                {bought.map((item) => (
                  <BoardCard key={item.id} item={item} onPress={() => setTarget(item)} bought />
                ))}
              </View>
            </View>
          )}

          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button label="Close session" variant="secondary" onPress={finishSession} />
            <Text style={[text.small, { fontSize: 11, textAlign: 'center' }]}>
              Swipe right to mark bought · swipe left to skip · tap to enter the exact price
            </Text>
          </View>
        </ScrollView>
      )}

      <CreateSessionSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          invalidate();
          show('Session started');
        }}
      />

      {session ? (
        <AddItemsSheet
          visible={addOpen}
          sessionId={session.id}
          existingItemIds={items.map((i) => i.itemId)}
          onClose={() => setAddOpen(false)}
          onDone={(added) => {
            invalidate();
            show(added > 0 ? `Added ${added} item${added === 1 ? '' : 's'}` : 'Already on your list');
          }}
        />
      ) : null}

      <CompleteItemSheet
        target={target}
        visible={target !== null}
        onClose={() => setTarget(null)}
        onDone={() => {
          invalidate();
          show('Purchase recorded');
        }}
      />

      <Toast message={message} />
    </Screen>
  );
}

function MiniStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <View style={styles.miniStep}>
      <View style={styles.stepNumber}>
        <Text style={{ color: colors.green, fontWeight: '800' }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.h3}>{title}</Text>
        <Text style={[text.small, { fontSize: 12 }]}>{body}</Text>
      </View>
    </View>
  );
}

function BoardCard({
  item,
  onPress,
  bought,
}: {
  item: SessionItemView;
  onPress: () => void;
  bought?: boolean;
}) {
  const last = unitPriceLabel(bought ? item.entry : item.previous, item.baseUnit);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.boardCard, bought && styles.boardCardBought, pressed && { opacity: 0.75 }]}
    >
      <Text style={[text.h3, { fontSize: 14 }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[text.small, { fontSize: 11 }]} numberOfLines={1}>
        {bought && item.entry
          ? formatMoney(item.entry.totalCentavos)
          : last
            ? `last ${last}`
            : 'no history'}
      </Text>
      {bought ? <PriceBadge comparison={item.comparison} compact /> : null}
      {!bought && item.lowestPerBase !== null && item.baseUnit ? (
        <Text style={{ fontSize: 10, color: colors.faint, fontWeight: '700' }}>lowest known</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: 32, gap: space.md },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionLabel: { ...text.tiny, marginTop: space.xs },
  board: { flexDirection: 'row', gap: space.sm },
  column: {
    flex: 1,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    minHeight: 180,
  },
  columnTitle: { ...text.tiny, paddingHorizontal: 4, paddingTop: 4 },
  columnEmpty: { ...text.small, fontSize: 12, padding: 8 },
  boardCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    gap: 4,
  },
  boardCardBought: { borderColor: 'rgba(53,208,127,0.35)' },
  miniStep: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'center',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
