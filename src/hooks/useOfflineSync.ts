"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOfflineStore } from "@/store/offline-store";
import { apiFetch, HttpError } from "@/lib/api-client";
import type { PendingItem } from "@/types";

const ENDPOINTS: Record<PendingItem["type"], string> = {
  mood: "/api/mood",
  journal: "/api/journal",
};

/**
 * Offline-first sync engine.
 *
 * Flow: callers `submit()` a payload → it is written to the persisted queue
 * immediately (instant UX) → when online, the queue is flushed in order.
 * The server de-duplicates by `clientId`, so retries / network flapping /
 * multiple offline submissions never create duplicates.
 */
export function useOfflineSync(onSynced?: () => void) {
  const {
    queue,
    online,
    syncing,
    lastSyncedAt,
    enqueue,
    dequeue,
    setOnline,
    setSyncing,
    markSynced,
  } = useOfflineStore();

  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (!navigator.onLine) return;

    const pending = useOfflineStore.getState().queue;
    if (pending.length === 0) return;

    flushing.current = true;
    setSyncing(true);
    try {
      for (const item of pending) {
        try {
          await apiFetch(ENDPOINTS[item.type], {
            method: "POST",
            body: JSON.stringify({ ...item.payload, clientId: item.clientId }),
          });
          // Success (or idempotent 200 dedupe) → remove from queue.
          dequeue(item.clientId);
        } catch (e) {
          // 4xx (except 429/408) means the payload is bad — drop it so the
          // queue doesn't get stuck. Otherwise keep it for the next attempt.
          if (
            e instanceof HttpError &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 429 &&
            e.status !== 408
          ) {
            dequeue(item.clientId);
          } else {
            // Network / server error: stop and retry later.
            break;
          }
        }
      }
      markSynced();
      onSynced?.();
    } finally {
      setSyncing(false);
      flushing.current = false;
    }
  }, [dequeue, markSynced, onSynced, setSyncing]);

  // Submit: queue locally, then opportunistically flush.
  const submit = useCallback(
    (type: PendingItem["type"], payload: Record<string, unknown>) => {
      const clientId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      enqueue({
        clientId,
        type,
        payload,
        createdAt: new Date().toISOString(),
      });
      void flush();
      return clientId;
    },
    [enqueue, flush],
  );

  // Connectivity listeners + initial flush.
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void flush();
    };
    const handleOffline = () => setOnline(false);

    setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void flush();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush, setOnline]);

  return {
    submit,
    flush,
    pendingCount: queue.length,
    online,
    syncing,
    lastSyncedAt,
  };
}
