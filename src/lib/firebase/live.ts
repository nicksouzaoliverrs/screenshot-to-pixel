// Realtime Firestore subscriptions for React. Data stays readable offline from the local cache;
// `fromCache` tells the UI when what it shows may be outdated.
import { useEffect, useRef, useState } from "react";
import { onSnapshot, type DocumentReference, type Query } from "firebase/firestore";

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
}

export function useLiveQuery<T>(key: string | null, make: () => Query | null, fallback: T[] = []): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: fallback, loading: !!key, error: null, fromCache: false });
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return;
    }
    let q: Query | null = null;
    try {
      q = makeRef.current();
    } catch (e) {
      setState({ data: [], loading: false, error: e as Error, fromCache: false });
      return;
    }
    if (!q) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T),
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
        }),
      (error) => {
        console.error(key, error);
        setState((s) => ({ ...s, loading: false, error }));
      },
    );
  }, [key]);
  return state;
}

export function useLiveDoc<T>(key: string | null, make: () => DocumentReference | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: !!key, error: null, fromCache: false });
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null, fromCache: false });
      return;
    }
    const ref = makeRef.current();
    if (!ref) {
      setState({ data: null, loading: false, error: null, fromCache: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.exists() ? ({ ...(snap.data() as object), id: snap.id } as T) : null,
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
        }),
      (error) => {
        console.error(key, error);
        setState((s) => ({ ...s, loading: false, error }));
      },
    );
  }, [key]);
  return state;
}
