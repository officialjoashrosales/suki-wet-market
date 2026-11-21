import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addItemsToSession,
  addParsedItemsToSession,
  createItem,
  listItems,
  type ItemSummary,
} from '@/db/repo';
import {
  formatParsedLine,
  mergeParsedLines,
  parseChecklistText,
} from '@/lib/checklist-parse';
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
  const [mode, setMode] = useState<'search' | 'paste'>('search');
  const [search, setSearch] = useState('');
  const [paste, setPaste] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setSearch('');
    setPaste('');
    setMode('search');
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

  const preview = useMemo(() => {
    const lines = mergeParsedLines(parseChecklistText(paste));
    return lines.map((line) => {
      const match = items.find((i) => i.name.toLowerCase() === line.name.toLowerCase());
      const status = !match
        ? 'new'
        : existingItemIds.includes(match.id)
          ? 'already on list'
          : 'in catalog';
      return { line, status };
    });
  }, [paste, items, existingItemIds]);

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

  async function submitSearch() {
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

  async function submitPaste() {
    const lines = preview.map((row) => row.line);
    if (lines.length === 0) return;
    setSaving(true);
    try {
      const added = await addParsedItemsToSession(sessionId, lines);
      onDone(added);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const pasteCount = preview.length;
  const searchCount = selected.size;
  const footerCount = mode === 'paste' ? pasteCount : searchCount;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add to list"
      footer={
        <Button
          label={saving ? 'Adding…' : `Add ${footerCount || ''} item${footerCount === 1 ? '' : 's'}`.trim()}
          onPress={mode === 'paste' ? submitPaste : submitSearch}
          disabled={saving || footerCount === 0}
        />
      }
    >
      <View style={styles.modeRow}>
        <Chip label="Search" active={mode === 'search'} onPress={() => setMode('search')} />
        <Chip label="Paste list" active={mode === 'paste'} onPress={() => setMode('paste')} />
      </View>

      {mode === 'paste' ? (
        <>
          <Field
            value={paste}
            onChangeText={setPaste}
            placeholder={'Paste your list, one item per line\ne.g. Pakbet 1kl'}
            multiline
            autoCorrect={false}
            hint="One item per line. Examples: Pakbet 1kl · Sili P20 · Cabbage 2pcs only"
          />
          {preview.length === 0 ? (
            <Text style={[text.small, { paddingVertical: space.sm }]}>
              Paste a list to preview names, qty, and ₱-worth notes.
            </Text>
          ) : (
            <View style={{ gap: space.sm }}>
              {preview.map(({ line, status }) => (
                <View key={line.name.toLowerCase()} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.h3}>{line.name}</Text>
                    <Text style={[text.small, { fontSize: 12 }]}>
                      {formatParsedLine(line)} · {status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
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
        </>
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
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
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
