import { describe, expect, it, beforeEach } from "vitest";
import { useOfflineStore } from "@/store/offline-store";
import type { PendingItem } from "@/types";

function item(clientId: string): PendingItem {
  return {
    clientId,
    type: "mood",
    payload: { mood: 3, stress: 4 },
    createdAt: new Date().toISOString(),
  };
}

describe("offline-store queue", () => {
  beforeEach(() => {
    useOfflineStore.setState({
      queue: [],
      online: true,
      syncing: false,
      lastSyncedAt: null,
    });
  });

  it("enqueues items", () => {
    useOfflineStore.getState().enqueue(item("a"));
    expect(useOfflineStore.getState().queue).toHaveLength(1);
  });

  it("prevents duplicate clientIds (offline dedup)", () => {
    const { enqueue } = useOfflineStore.getState();
    enqueue(item("dup"));
    enqueue(item("dup"));
    expect(useOfflineStore.getState().queue).toHaveLength(1);
  });

  it("dequeues by clientId", () => {
    const { enqueue, dequeue } = useOfflineStore.getState();
    enqueue(item("x"));
    enqueue(item("y"));
    dequeue("x");
    const q = useOfflineStore.getState().queue;
    expect(q).toHaveLength(1);
    expect(q[0].clientId).toBe("y");
  });

  it("markSynced records a timestamp", () => {
    useOfflineStore.getState().markSynced();
    expect(useOfflineStore.getState().lastSyncedAt).not.toBeNull();
  });
});
