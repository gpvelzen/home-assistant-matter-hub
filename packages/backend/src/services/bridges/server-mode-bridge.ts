import {
  BridgeStatus,
  type UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import { SessionManager } from "@matter/main/protocol";
import type { LoggerService } from "../../core/app/logger.js";
import type { ServerModeServerNode } from "../../matter/endpoints/server-mode-server-node.js";
import type {
  BridgeDataProvider,
  BridgeServerStatus,
} from "./bridge-data-provider.js";
import type { ServerModeEndpointManager } from "./server-mode-endpoint-manager.js";

// Auto Force Sync interval in milliseconds (90 seconds).
// When autoForceSync is enabled, this pushes changed entity states to
// Matter controllers. matter.js handles subscription keepalive internally
// via empty DataReports every ~sendInterval.
const AUTO_FORCE_SYNC_INTERVAL_MS = 90_000;

// Subscription health check interval in milliseconds (60 seconds).
// Runs independently of force sync (no MRP traffic — only reads session state)
// so dead sessions and orphaned bridges are detected quickly.
const SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS = 60_000;

// Number of consecutive health checks with 0 subscriptions before
// closing a dead session to force the controller to reconnect.
// With 60s intervals, 3 checks = ~3 minutes grace period.
const DEAD_SESSION_THRESHOLD = 3;

// Number of consecutive health checks with 0 sessions (for a commissioned bridge)
// before counting as an orphan recovery cycle.
// With 60s intervals, 5 checks = ~5 minutes grace period.
const ORPHAN_SESSION_THRESHOLD = 5;

// Number of consecutive orphan recovery cycles without connectivity
// before attempting a bridge restart.
// With ORPHAN_SESSION_THRESHOLD=5 and 60s intervals, 2 cycles = ~10 minutes
// of persistent orphan state before the bridge is restarted.
const BRIDGE_RESTART_ORPHAN_CYCLES = 2;

// Minimum interval between automatic bridge restarts (30 minutes).
// Prevents restart loops if the controller never reconnects.
const MIN_BRIDGE_RESTART_INTERVAL_MS = 1_800_000;

// Delay before restarting the bridge after stop (milliseconds).
// Needs to be long enough for UDP sockets to fully release.
// Some systems (especially Linux containers) need more time.
const BRIDGE_RESTART_DELAY_MS = 5_000;

/**
 * ServerModeBridge exposes a single device as a standalone Matter device.
 * This is required for Apple Home to properly support Siri voice commands
 * for Robot Vacuums (RVC) and similar device types.
 */
export class ServerModeBridge {
  private readonly log: Logger;

  private status: BridgeServerStatus = {
    code: BridgeStatus.Stopped,
    reason: undefined,
  };

  // Called whenever the bridge status changes. Set by BridgeService to
  // broadcast updates via WebSocket so the frontend sees every transition.
  public onStatusChange?: () => void;

  private autoForceSyncTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionHealthTimer: ReturnType<typeof setInterval> | null = null;

  // Tracks sessions with 0 active subscriptions across consecutive health checks.
  // Key: session ID (number), Value: consecutive checks with 0 subscriptions.
  private deadSessionCounts = new Map<number, number>();

  // Tracks consecutive health checks where a commissioned bridge has 0 active sessions.
  private noSessionCount = 0;

  // Whether the bridge has ever had an active session (meaning it was paired and connected).
  private hadActiveSession = false;

  // Number of orphan recovery cycles without connectivity.
  // Used to escalate to bridge restart after repeated failures.
  private orphanRecoveryCycles = 0;

  // Timestamp of the last automatic bridge restart (prevents restart loops).
  private lastBridgeRestartTime = 0;

  // Tracks the last synced state JSON per entity to avoid pushing unchanged states.
  private lastSyncedState: string | undefined;

  get id(): string {
    return this.dataProvider.id;
  }

  get data() {
    return this.dataProvider.withMetadata(
      this.status,
      this.server,
      this.endpointManager.device ? 1 : 0,
      this.endpointManager.failedEntities,
    );
  }

  getSessionInfo(): {
    sessions: Array<{
      id: number;
      peerNodeId: string;
      subscriptionCount: number;
    }>;
    totalSessions: number;
    totalSubscriptions: number;
    orphanChecks: number;
    hadActiveSession: boolean;
  } {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      const sessions = [...sessionManager.sessions];
      let totalSubscriptions = 0;
      const sessionList = sessions.map((s) => {
        const subCount = s.subscriptions.size;
        totalSubscriptions += subCount;
        return {
          id: s.id,
          peerNodeId: String(s.peerNodeId),
          subscriptionCount: subCount,
        };
      });
      return {
        sessions: sessionList,
        totalSessions: sessions.length,
        totalSubscriptions,
        orphanChecks: this.noSessionCount,
        hadActiveSession: this.hadActiveSession,
      };
    } catch {
      return {
        sessions: [],
        totalSessions: 0,
        totalSubscriptions: 0,
        orphanChecks: 0,
        hadActiveSession: false,
      };
    }
  }

  constructor(
    logger: LoggerService,
    private readonly dataProvider: BridgeDataProvider,
    private readonly endpointManager: ServerModeEndpointManager,
    readonly server: ServerModeServerNode,
  ) {
    this.log = logger.get(`ServerModeBridge / ${dataProvider.id}`);
  }

  async initialize(): Promise<void> {
    await this.server.construction.ready.then();
    await this.refreshDevices();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  async refreshDevices(): Promise<void> {
    await this.endpointManager.refreshDevices();
  }

  private setStatus(status: BridgeServerStatus) {
    this.status = status;
    this.onStatusChange?.();
  }

  async start(): Promise<void> {
    if (this.status.code === BridgeStatus.Running) {
      return;
    }
    // Reset health check state so orphan detection does not trigger
    // immediately after a restart (controllers need time to reconnect).
    this.hadActiveSession = false;
    this.noSessionCount = 0;
    this.orphanRecoveryCycles = 0;
    this.deadSessionCounts.clear();
    this.lastSyncedState = undefined;
    try {
      this.setStatus({
        code: BridgeStatus.Starting,
        reason: "The server mode bridge is starting... Please wait.",
      });
      await this.refreshDevices();
      this.endpointManager.startObserving();
      await this.server.start();
      this.setStatus({ code: BridgeStatus.Running });
      this.startAutoForceSyncIfEnabled();
      this.log.info("Server mode bridge started successfully");
    } catch (e) {
      const reason = "Failed to start server mode bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async stop(
    code: BridgeStatus = BridgeStatus.Stopped,
    reason = "Manually stopped",
  ): Promise<void> {
    this.stopAutoForceSync();
    this.endpointManager.stopObserving();
    try {
      await this.server.cancel();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes("mutex-closed")) {
        this.log.warn("Error stopping server mode bridge:", e);
      }
    }
    this.setStatus({ code, reason });
  }

  async update(update: UpdateBridgeRequest): Promise<void> {
    try {
      this.dataProvider.update(update);
      await this.refreshDevices();
      // Re-evaluate auto force sync setting after config update
      if (this.status.code === BridgeStatus.Running) {
        this.startAutoForceSyncIfEnabled();
      }
    } catch (e) {
      const reason = "Failed to update server mode bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async factoryReset(): Promise<void> {
    if (this.status.code !== BridgeStatus.Running) {
      return;
    }
    await this.server.factoryReset();
    this.setStatus({ code: BridgeStatus.Stopped });
    await this.start();
  }

  private startAutoForceSyncIfEnabled() {
    // Stop any existing timers first
    this.stopAutoForceSync();

    // Health checks ALWAYS run to detect dead sessions and orphaned bridges.
    // Force sync only runs when the autoForceSync feature flag is enabled.
    // matter.js handles subscription keepalive internally via empty DataReports.
    this.autoForceSyncTimer = setInterval(() => {
      this.forceSync().catch((e) => {
        this.log.warn("Auto force sync failed:", e);
      });
    }, AUTO_FORCE_SYNC_INTERVAL_MS);
    this.subscriptionHealthTimer = setInterval(() => {
      this.checkSubscriptionHealth().catch((e) => {
        this.log.debug("Subscription health check failed:", e);
      });
    }, SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS);

    const forceSyncEnabled =
      this.dataProvider.featureFlags?.autoForceSync ?? false;
    this.log.info(
      `Health checks: every ${SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS / 1000}s` +
        (forceSyncEnabled
          ? `, force sync: every ${AUTO_FORCE_SYNC_INTERVAL_MS / 1000}s`
          : ""),
    );
  }

  private stopAutoForceSync() {
    if (this.autoForceSyncTimer) {
      clearInterval(this.autoForceSyncTimer);
      this.autoForceSyncTimer = null;
    }
    if (this.subscriptionHealthTimer) {
      clearInterval(this.subscriptionHealthTimer);
      this.subscriptionHealthTimer = null;
    }
  }

  async delete(): Promise<void> {
    await this.server.delete();
  }

  /**
   * Force sync the device state to all connected Matter controllers.
   * Only pushes state when the entity state has actually changed since
   * the last sync to avoid unnecessary MRP traffic.
   */
  async forceSync(): Promise<number> {
    if (this.status.code !== BridgeStatus.Running) {
      return 0;
    }

    if (!this.dataProvider.featureFlags?.autoForceSync) {
      return 0;
    }

    const device = this.endpointManager.device;
    if (!device) {
      return 0;
    }

    try {
      // Import dynamically to avoid circular dependencies
      const { HomeAssistantEntityBehavior } = await import(
        "../../matter/behaviors/home-assistant-entity-behavior.js"
      );

      if (!device.behaviors.has(HomeAssistantEntityBehavior)) {
        return 0;
      }

      const behavior = device.stateOf(HomeAssistantEntityBehavior);
      const currentEntity = behavior.entity;

      if (currentEntity?.state) {
        // Compare only meaningful fields — ignore volatile HA metadata
        // (last_changed, last_updated, context) to avoid unnecessary MRP traffic.
        const stateJson = JSON.stringify({
          s: currentEntity.state.state,
          a: currentEntity.state.attributes,
        });

        if (stateJson !== this.lastSyncedState) {
          // State has changed since last sync — push update
          await device.setStateOf(HomeAssistantEntityBehavior, {
            entity: {
              ...currentEntity,
              state: { ...currentEntity.state },
            },
          });
          this.lastSyncedState = stateJson;
          this.log.info("Force sync: Pushed 1 changed device");
          return 1;
        }
      }
    } catch (e) {
      this.log.debug("Force sync: Failed due to error:", e);
    }

    return 0;
  }

  private async checkSubscriptionHealth(): Promise<void> {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      const sessions = [...sessionManager.sessions];
      const seenSessionIds = new Set<number>();

      // Check if bridge is commissioned (has fabrics).
      // If so, treat it as having had an active session even if none is present
      // in this runtime. This handles the case where the bridge restarts but
      // the controller (Alexa) never reconnects - orphan detection should still work.
      const commissioning = this.server.state.commissioning;
      const hasFabrics =
        commissioning?.commissioned &&
        Object.keys(commissioning.fabrics ?? {}).length > 0;
      if (hasFabrics && !this.hadActiveSession) {
        this.hadActiveSession = true;
        this.log.debug(
          `Subscription health: Bridge is commissioned with fabrics, enabling orphan detection`,
        );
      }

      let totalSubscriptions = 0;
      for (const session of sessions) {
        const sessionId = session.id;
        seenSessionIds.add(sessionId);
        totalSubscriptions += session.subscriptions.size;

        const subscriptionCount = session.subscriptions.size;

        if (subscriptionCount === 0) {
          const count = (this.deadSessionCounts.get(sessionId) ?? 0) + 1;
          this.deadSessionCounts.set(sessionId, count);

          if (count === 1) {
            this.log.info(
              `Subscription health: Session ${sessionId} (peer ${session.peerNodeId}) has no active subscriptions (${count}/${DEAD_SESSION_THRESHOLD})`,
            );
          }

          if (count >= DEAD_SESSION_THRESHOLD) {
            this.log.warn(
              `Subscription health: Session ${sessionId} (peer ${session.peerNodeId}) has had no subscriptions for ${count} consecutive checks. ` +
                `Force-closing session to allow clean reconnection.`,
            );
            try {
              await session.initiateForceClose();
            } catch (e) {
              this.log.debug(
                `Subscription health: Failed to force-close session ${sessionId}:`,
                e,
              );
            }
            this.deadSessionCounts.delete(sessionId);
          }
        } else {
          // Session has active subscriptions - reset counter if tracked
          if (this.deadSessionCounts.has(sessionId)) {
            this.log.info(
              `Subscription health: Session ${sessionId} recovered with ${subscriptionCount} subscription(s)`,
            );
            this.deadSessionCounts.delete(sessionId);
          }
        }
      }

      // Track whether we ever had active sessions.
      // Reset all recovery counters when a healthy session is present.
      if (sessions.length > 0 && totalSubscriptions > 0) {
        this.hadActiveSession = true;
        this.noSessionCount = 0;
        this.orphanRecoveryCycles = 0;
      } else if (sessions.length > 0) {
        this.hadActiveSession = true;
      }

      // Detect orphaned bridge: was previously connected but now has 0 sessions.
      // This happens when matter.js removes the session entirely after MRP retransmission
      // failures (peer loss). The per-session check above never sees this because the
      // session is already gone from sessionManager.sessions.
      if (sessions.length === 0 && this.hadActiveSession) {
        this.noSessionCount++;

        if (this.noSessionCount === 1) {
          this.log.warn(
            `Subscription health: Bridge has 0 active sessions but was previously connected. ` +
              `Controller may have disconnected. Waiting for reconnection... (${this.noSessionCount}/${ORPHAN_SESSION_THRESHOLD})`,
          );
        }

        if (this.noSessionCount >= ORPHAN_SESSION_THRESHOLD) {
          this.orphanRecoveryCycles++;
          this.log.warn(
            `Subscription health: Bridge has been orphaned for ${this.noSessionCount} consecutive checks (~${this.noSessionCount} minutes). ` +
              `Recovery cycle ${this.orphanRecoveryCycles}/${BRIDGE_RESTART_ORPHAN_CYCLES}.`,
          );
          this.noSessionCount = 0;

          // Escalate: restart bridge after repeated failed recovery cycles.
          if (this.orphanRecoveryCycles >= BRIDGE_RESTART_ORPHAN_CYCLES) {
            this.orphanRecoveryCycles = 0;
            await this.restartBridge();
            return; // Timers restarted by start(), bail out of this check
          }
        }
      }

      // Log diagnostic summary when orphaned or no subscriptions
      if (this.noSessionCount > 0 || totalSubscriptions === 0) {
        this.log.debug(
          `Subscription health: sessions=${sessions.length}, subscriptions=${totalSubscriptions}, orphanChecks=${this.noSessionCount}/${ORPHAN_SESSION_THRESHOLD}`,
        );
      }

      // Clean up tracking for sessions that no longer exist
      for (const sessionId of this.deadSessionCounts.keys()) {
        if (!seenSessionIds.has(sessionId)) {
          this.deadSessionCounts.delete(sessionId);
        }
      }
    } catch (e) {
      this.log.debug("Subscription health check failed:", e);
    }
  }

  /**
   * Restart the bridge to force a completely fresh connection state.
   * This is the nuclear option after repeated failed recovery attempts.
   */
  private async restartBridge(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBridgeRestartTime < MIN_BRIDGE_RESTART_INTERVAL_MS) {
      this.log.warn(
        `Subscription health: Bridge restart skipped — last restart was less than ${MIN_BRIDGE_RESTART_INTERVAL_MS / 60_000} minutes ago. Will continue monitoring.`,
      );
      return;
    }

    this.lastBridgeRestartTime = now;
    this.log.warn(
      "Subscription health: Performing bridge restart to force controller reconnection...",
    );

    try {
      await this.stop(
        BridgeStatus.Stopped,
        "Auto-restart for session recovery",
      );
      // Delay to let UDP sockets fully release before re-binding.
      // Linux containers especially need extra time.
      this.log.info(
        `Subscription health: Waiting ${BRIDGE_RESTART_DELAY_MS}ms for sockets to release...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, BRIDGE_RESTART_DELAY_MS),
      );
      await this.start();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // If port is in use, don't retry immediately - wait for the next
      // scheduled restart attempt (MIN_BRIDGE_RESTART_INTERVAL_MS).
      if (errorMessage.includes("address-in-use")) {
        this.log.error(
          `Subscription health: Bridge restart failed - port still in use. ` +
            `Another process may be using this port. Will not retry for ${MIN_BRIDGE_RESTART_INTERVAL_MS / 60_000} minutes.`,
        );
        // lastBridgeRestartTime is already set, so the next attempt will be
        // blocked by the MIN_BRIDGE_RESTART_INTERVAL_MS check.
      } else {
        this.log.error("Subscription health: Bridge restart failed:", e);
      }
    }
  }
}
