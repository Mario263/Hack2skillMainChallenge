import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PendingItem } from "@/types";

interface OfflineState {
  queue: PendingItem[];
  online: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;

  enqueue: (item: PendingItem) => void;
  dequeue: (clientId: string) => void;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  markSynced: () => void;
}

// Persisted to localStorage so queued submissions survive refresh / tab close.
export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      queue: [],
      online: true,
      syncing: false,
      lastSyncedAt: null,

      enqueue: (item) =>
        set((state) => {
          // Duplicate-sync prevention: never queue the same clientId twice.
          if (state.queue.some((q) => q.clientId === item.clientId)) {
            return state;
          }
          return { queue: [...state.queue, item] };
        }),

      dequeue: (clientId) =>
        set((state) => ({
          queue: state.queue.filter((q) => q.clientId !== clientId),
        })),

      setOnline: (online) => set({ online }),
      setSyncing: (syncing) => set({ syncing }),
      markSynced: () => set({ lastSyncedAt: new Date().toISOString() }),
    }),
    {
      name: "wellness-offline-queue",
      // Only persist the queue; transient flags reset on load.
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);
