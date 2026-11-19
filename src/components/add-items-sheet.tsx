import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addItemsToSession, createItem, listItems, type ItemSummary } from '@/db/repo';
import { formatDate } from '@/lib/id';
import { unitPriceLabel } from '@/lib/labels';
import { formatPerBase } from '@/lib/pricing';
import { colors, radius, space, text } from '@/lib/theme';

import { Button, Chip, Field, Sheet } from './ui';

export function AddItemsSheet({
  visible,
  sessionId,
  existingItemIds,
  onClose,
  onDone,
}: {
  visible: boolean;
  sessionId: string;
  existingItemIds: string[];
  onClose: () => void;
  onDone: (added: number) => void;
}) {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setSearch('');
    setError(null);
    setSaving(false);
    listItems().then(setItems);
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const exactExists = items.some((i) => i.name.toLowerCase() === search.trim().toLowerCase());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function quickCreate() {
    const name = search.trim();
    if (!name) return;
    try {
      const id = await createItem({ name });
      const next = await listItems();
      setItems(next);
      setSelected((prev) => new Set(prev).add(id));
      setSearch('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const added = await addItemsToSession(sessionId, Array.from(selected));
      onDone(added);
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
      title="Add to list"
      footer={
        <Button
          label={saving ? 'Adding…' : `Add ${selected.size || ''} item${selected.size === 1 ? '' : 's'}`.trim()}
          onPress={submit}
          disabled={saving || selected.size === 0}
        />
      }
    >
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search my items…"
        autoCorrect={false}
      />

      {!exactExists && search.trim() ? (
        <Pressable onPress={quickCreate} style={styles.createRow}>
          <Text style={{ color: colors.green, fontWeight: '700' }}>+ Create “{search.trim()}”</Text>
          <Text style={[text.small, { fontSize: 12 }]}>adds it to My Items too</Text>
        </Pressable>
      ) : null}

      {filtered.length === 0 ? (
        <Text style={[text.small, { paddingVertical: space.lg, textAlign: 'center' }]}>
          {items.length === 0
            ? 'No items yet. Type a name above to create your first one.'
            : 'No matches. Type a different name to create it.'}
        </Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {filtered.map((item) => {
            const already = existingItemIds.includes(item.id);
            const isSelected = selected.has(item.id);
            const last = unitPriceLabel(item.lastEntry, item.baseUnit);
            return (
              <Pressable
                key={item.id}
                disabled={already}
                onPress={() => toggle(item.id)}
                style={[
                  styles.itemRow,
                  isSelected && { borderColor: colors.green, backgroundColor: colors.greenDim },
                  already && { opacity: 0.4 },
                ]}
              >
                <View style={styles.check}>
                  <Text style={{ color: isSelected ? colors.green : 'transparent', fontWeight: '900' }}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text.h3}>{item.name}</Text>
                  <Text style={[text.small, { fontSize: 12 }]} numberOfLines={1}>
                    {already
                      ? 'already in this session'
                      : last
                        ? `last ${last}${item.lastPurchasedAt ? ` · ${formatDate(item.lastPurchasedAt)}` : ''}`
                        : `${item.category} · no history`}
                    {item.lowestPerBase !== null && item.baseUnit
                      ? ` · lowest ${formatLowest(item)}`
                      : ''}
                  </Text>
                </View>
                <Chip label={item.displayUnit ?? '—'} />
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </Sheet>
  );
}

function formatLowest(item: ItemSummary): string {
  if (item.lowestPerBase === null || item.baseUnit === null) return '';
  return formatPerBase(item.lowestPerBase, item.baseUnit);
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.green,
    backgroundColor: colors.greenDim,
  },
});
