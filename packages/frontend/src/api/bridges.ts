import type {
  BridgeDataWithMetadata,
  CreateBridgeRequest,
  UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";

export async function fetchBridges() {
  const res = await fetch(`api/matter/bridges?_s=${Date.now()}`);
  const json = await res.json();
  return json as BridgeDataWithMetadata[];
}

export async function createBridge(req: CreateBridgeRequest) {
  return fetch("api/matter/bridges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  }).then((res) => res.json() as Promise<BridgeDataWithMetadata>);
}

export async function updateBridge(req: UpdateBridgeRequest) {
  return fetch(`api/matter/bridges/${req.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  }).then((res) => res.json() as Promise<BridgeDataWithMetadata>);
}

export async function deleteBridge(bridgeId: string) {
  await fetch(`api/matter/bridges/${bridgeId}`, {
    method: "DELETE",
  });
}

export async function resetBridge(bridgeId: string) {
  return await fetch(`api/matter/bridges/${bridgeId}/actions/factory-reset`, {
    method: "POST",
  }).then((res) => res.json() as Promise<BridgeDataWithMetadata>);
}

export async function forceSyncBridge(
  bridgeId: string,
): Promise<{ syncedCount: number; bridge: BridgeDataWithMetadata }> {
  return await fetch(`api/matter/bridges/${bridgeId}/actions/force-sync`, {
    method: "POST",
  }).then((res) => res.json());
}

export interface BridgePriorityUpdate {
  id: string;
  priority: number;
}

export async function updateBridgePriorities(
  updates: BridgePriorityUpdate[],
): Promise<void> {
  const res = await fetch("api/matter/bridges/priorities", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    throw new Error("Failed to update priorities");
  }
}

export async function startAllBridges(): Promise<{
  success: boolean;
  count: number;
}> {
  const res = await fetch("api/matter/bridges/actions/start-all", {
    method: "POST",
  });
  return res.json();
}

export async function stopAllBridges(): Promise<{
  success: boolean;
  count: number;
}> {
  const res = await fetch("api/matter/bridges/actions/stop-all", {
    method: "POST",
  });
  return res.json();
}

export async function restartAllBridges(): Promise<{
  success: boolean;
  count: number;
}> {
  const res = await fetch("api/matter/bridges/actions/restart-all", {
    method: "POST",
  });
  return res.json();
}

export async function cloneBridge(
  bridgeId: string,
): Promise<BridgeDataWithMetadata> {
  const res = await fetch(`api/matter/bridges/${bridgeId}/clone`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Clone failed" }));
    throw new Error((err as { error?: string }).error ?? "Clone failed");
  }
  return res.json() as Promise<BridgeDataWithMetadata>;
}
