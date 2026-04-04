import { createContext, useContext, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { buildMemoryIndex } from '../utils/memoryIndex';
import { chunkMemoryEntries } from '../utils/chunker';

// eslint-disable-next-line react-refresh/only-export-components
export const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const store = useStore();
  const embeddingDebounceRef = useRef(null);

  // Debounced background sync of all memory entries to the vector store.
  // Runs 5s after any change to the entities that feed the memory index.
  // Silent on failure — never blocks the UI.
  useEffect(() => {
    clearTimeout(embeddingDebounceRef.current);
    embeddingDebounceRef.current = setTimeout(async () => {
      try {
        const entries = buildMemoryIndex(store);
        const chunks = chunkMemoryEntries(entries);
        if (chunks.length === 0) return;
        await fetch('/api/embeddings?op=upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_API_SECRET}`,
          },
          body: JSON.stringify({ chunks }),
        });
        console.log(`[Memory] Synced ${chunks.length} chunks to vector store`);
      } catch (err) {
        console.warn('[Memory] Embedding sync failed silently:', err.message);
      }
    }, 5000);
  }, [
    store.tasks,
    store.weeklyUpdateLogs,
    store.meetingEntries,
    store.aiOutputs,
    store.milestones,
    store.points,
    store.annotations,
  ]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppStore() {
  return useContext(StoreContext);
}
