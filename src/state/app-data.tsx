import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { migrate } from '@/db';
import { maybeAutoBackup } from '@/lib/backup';

interface AppDataValue {
  ready: boolean;
  error: string | null;
  version: number;
  invalidate: () => void;
}

const AppDataContext = createContext<AppDataValue>({
  ready: false,
  error: null,
  version: 0,
  invalidate: () => {},
});

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    migrate()
      .then(async () => {
        await maybeAutoBackup();
        if (alive) setReady(true);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const invalidate = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <AppDataContext.Provider value={{ ready, error, version, invalidate }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs a DB query and re-runs it whenever the shared data version bumps.
 * Reads are local SQLite, so there is never a network spinner here.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { version, ready } = useAppData();
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    loaderRef.current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e: unknown) =>
        alive &&
        setState({
          data: null,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready, ...deps]);

  return state;
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}
