import { useState, useCallback } from 'react';
import { WikiEntry, WikiIndexEntry } from '@/lib/types';

export function useWiki() {
  const [entries, setEntries] = useState<WikiIndexEntry[]>([]);
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const [neighbors, setNeighbors] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wiki');
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntry = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wiki?id=${id}&neighborhood=true`);
      const data = await res.json();
      setEntry(data.concept || data);
      setNeighbors(data.neighbors || []);
    } catch {
      setEntry(null);
      setNeighbors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setEntry(null);
    setNeighbors([]);
  }, []);

  return { entries, entry, neighbors, loading, loadList, loadEntry, clear };
}
