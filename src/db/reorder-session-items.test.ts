import { reorderSessionItems } from './repo';

interface StoredRow {
  id: string;
  sessionId: string;
  sort_order: number;
  updated_at: string;
}

interface MockDb {
  sqlite: {
    getAllAsync: jest.Mock;
    withExclusiveTransactionAsync: jest.Mock;
  };
  __rows: StoredRow[];
  __statement: {
    executeAsync: jest.Mock;
    finalizeAsync: jest.Mock;
  };
}

jest.mock('./index', () => {
  const rows: StoredRow[] = [];
  const statement = {
    executeAsync: jest.fn(async (params: unknown[]) => {
      const [sortOrder, timestamp, id, sessionId] = params as [number, string, string, string];
      const row = rows.find((candidate) => candidate.id === id && candidate.sessionId === sessionId);
      if (!row) return { changes: 0, lastInsertRowId: 0 };
      row.sort_order = sortOrder;
      row.updated_at = timestamp;
      return { changes: 1, lastInsertRowId: 0 };
    }),
    finalizeAsync: jest.fn(async () => {}),
  };
  const sqlite = {
    getAllAsync: jest.fn(async (_sql: string, params: unknown[]) => {
      const [sessionId] = params as [string];
      return rows
        .filter((row) => row.sessionId === sessionId)
        .map((row) => ({ id: row.id, sort_order: row.sort_order }));
    }),
    withExclusiveTransactionAsync: jest.fn(async (task: (txn: unknown) => Promise<void>) => {
      await task({ prepareAsync: jest.fn(async () => statement) });
    }),
    runAsync: jest.fn(),
  };
  return { sqlite, db: {}, __rows: rows, __statement: statement };
});

const mockDb = jest.requireMock('./index') as MockDb;

function seedRows() {
  jest.clearAllMocks();
  mockDb.__rows.length = 0;
  ['a', 'b', 'c', 'd'].forEach((id, index) => {
    mockDb.__rows.push({ id, sessionId: 's1', sort_order: index, updated_at: 'old' });
  });
}

function readOrder(): string[] {
  return [...mockDb.__rows]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row) => row.id);
}

describe('reorderSessionItems', () => {
  it('persists a permutation and only bumps rows whose index changed', async () => {
    seedRows();

    await reorderSessionItems('s1', ['b', 'a', 'c', 'd']);

    expect(readOrder()).toEqual(['b', 'a', 'c', 'd']);
    const byId = new Map(mockDb.__rows.map((row) => [row.id, row]));
    const movedTimestamps = ['a', 'b'].map((id) => byId.get(id)!.updated_at);
    expect(movedTimestamps[0]).not.toBe('old');
    expect(movedTimestamps[0]).toBe(movedTimestamps[1]);
    expect(['c', 'd'].map((id) => byId.get(id)!.updated_at)).toEqual(['old', 'old']);
    expect(mockDb.__statement.executeAsync).toHaveBeenCalledTimes(2);
    expect(mockDb.__statement.finalizeAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.sqlite.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not open a transaction when the order is unchanged', async () => {
    seedRows();

    await reorderSessionItems('s1', ['a', 'b', 'c', 'd']);

    expect(mockDb.sqlite.withExclusiveTransactionAsync).not.toHaveBeenCalled();
    expect(mockDb.__rows.every((row) => row.updated_at === 'old')).toBe(true);
  });

  it('serializes overlapping writes so the last order wins', async () => {
    seedRows();

    await Promise.all([
      reorderSessionItems('s1', ['b', 'a', 'c', 'd']),
      reorderSessionItems('s1', ['d', 'c', 'b', 'a']),
    ]);

    expect(readOrder()).toEqual(['d', 'c', 'b', 'a']);
    expect(mockDb.sqlite.withExclusiveTransactionAsync).toHaveBeenCalledTimes(2);
  });

  it('rejects stale or duplicate orders without breaking later writes', async () => {
    seedRows();

    await expect(reorderSessionItems('s1', ['a', 'b', 'c'])).rejects.toThrow('out of date');
    await expect(reorderSessionItems('s1', ['a', 'a', 'c', 'd'])).rejects.toThrow('duplicate');
    await expect(reorderSessionItems('s1', ['d', 'c', 'b', 'a'])).resolves.toBeUndefined();
    expect(readOrder()).toEqual(['d', 'c', 'b', 'a']);
  });
});
