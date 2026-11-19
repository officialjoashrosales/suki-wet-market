import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Chip, EmptyState, Field, Loading, PageHeader, Screen, Sheet, Toast } from '@/components/ui';
import { CATEGORIES, createItem, listItems, type ItemSummary, type UnitKind } from '@/db/repo';
import { daysAgo } from '@/lib/id';
import { unitPriceLabel } from '@/lib/labels';
import { formatPerBase } from '@/lib/pricing';
import { colors, space, text } from '@/lib/theme';
import { useAppData, useAsyncData, useToast } from '@/state/app-data';

type SortMode = 'used' | 'name' | 'recent';

export default function ItemsScreen() {
  const { invalidate } = useAppData();
  const { message, show } = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('used');
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const { data, loading } = useAsyncData(() => listItems(undefined, true));

  const items = useMemo(() => {
    const list = (data ?? []).filter((i) => showArchived || !i.archivedAt);
    const filtered = search.trim()
      ? list.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
      : list;
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return (b.lastPurchasedAt ?? '').localeCompare(a.lastPurchasedAt ?? '');
      return b.purchaseCount - a.purchaseCount || a.name.localeCompare(b.name);
    });
  }, [data, search, sort, showArchived]);

  return (
    <Screen>
      <PageHeader
        title="My Items"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} in your catalog`}
        right={<Button label="+ New" compact onPress={() => setNewOpen(true)} />}
      />

      <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md }}>
        <Field value={search} onChangeText={setSearch} placeholder="Search items…" autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Most used" active={sort === 'used'} onPress={() => setSort('used')} />
          <Chip label="Recent" active={sort === 'recent'} onPress={() => setSort('recent')} />
          <Chip label="A–Z" active={sort === 'name'} onPress={() => setSort('name')} />
          <Chip label="Archived" active={showArchived} onPress={() => setShowArchived((v) => !v)} />
        </View>
      </View>

      {loading && !data ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <EmptyState
              emoji="🏷️"
              title={search ? 'No matches' : 'No items yet'}
              body={
                search
                  ? 'Try another name, or create this item.'
                  : 'Items are reusable across sessions. Add the things you regularly buy at the market.'
              }
              action={
                <Button
                  label={search ? `Create “${search.trim()}”` : 'Create first item'}
                  onPress={() => setNewOpen(true)}
                />
              }
            />
          ) : (
            items.map((item) => <ItemCard key={item.id} item={item} />)
          )}
        </ScrollView>
      )}

      <NewItemSheet
        visible={newOpen}
        initialName={search}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setSearch('');
          invalidate();
          show('Item created');
          router.push(`/item/${id}`);
        }}
      />

      <Toast message={message} />
    </Screen>
  );
}

function ItemCard({ item }: { item: ItemSummary }) {
  const last = unitPriceLabel(item.lastEntry, item.baseUnit);
  return (
    <Pressable onPress={() => router.push(`/item/${item.id}`)}>
      <Card style={styles.itemCard}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[text.h3, { flexShrink: 1 }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.displayUnit ? <Chip label={item.displayUnit} /> : null}
            {item.archivedAt ? <Chip label="archived" tone="amber" /> : null}
          </View>
          <Text style={[text.small, { fontSize: 12 }]}>
            {item.category}
            {item.purchaseCount > 0
              ? ` · ${item.purchaseCount} purchase${item.purchaseCount === 1 ? '' : 's'} · ${daysAgo(item.lastPurchasedAt)}`
              : ' · never bought'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
            <Stat label="LAST" value={last ?? '—'} />
            <Stat
              label="LOWEST"
              value={
                item.lowestPerBase !== null && item.baseUnit
                  ? lowestLabel(item)
                  : '—'
              }
            />
          </View>
        </View>
        <Text style={{ color: colors.faint, fontSize: 22 }}>›</Text>
      </Card>
    </Pressable>
  );
}

function lowestLabel(item: ItemSummary): string {
  if (item.lowestPerBase === null || item.baseUnit === null) return '—';
  return formatPerBase(item.lowestPerBase, item.baseUnit);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={text.tiny}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function NewItemSheet({
  visible,
  initialName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [unitKind, setUnitKind] = useState<UnitKind>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setName(initialName);
      setCategory('Other');
      setUnitKind('none');
      setError(null);
      setSaving(false);
    }
  }, [visible, initialName]);

  async function submit() {
    if (!name.trim()) {
      setError('Give the item a name.');
      return;
    }
    setSaving(true);
    try {
      const id = await createItem({ name, category, unitKind });
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
      title="New item"
      footer={<Button label={saving ? 'Creating…' : 'Create item'} onPress={submit} disabled={saving} />}
    >
      <Field label="Item name" value={name} onChangeText={setName} placeholder="e.g. Pork belly" autoFocus />
      <View style={{ gap: 6 }}>
        <Text style={text.tiny}>CATEGORY</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={text.tiny}>UNIT (OPTIONAL)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="No unit" active={unitKind === 'none'} onPress={() => setUnitKind('none')} />
          <Chip label="Weight · kg" active={unitKind === 'weight'} onPress={() => setUnitKind('weight')} />
          <Chip label="Volume · L" active={unitKind === 'volume'} onPress={() => setUnitKind('volume')} />
          <Chip label="Count · pc" active={unitKind === 'count'} onPress={() => setUnitKind('count')} />
        </View>
        <Text style={[text.small, { fontSize: 12 }]}>
          Units unlock price-per-kg comparisons. You can skip this now and add it later.
        </Text>
      </View>
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: 32, gap: space.sm },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
