import type { HomeAssistantEntityInformation } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import {
  RvcRunModeServer as Base,
  ServiceAreaBehavior,
} from "@matter/main/behaviors";
import { ServiceArea } from "@matter/main/clusters";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { RvcRunMode } from "@matter/main/clusters/rvc-run-mode";
import { EntityStateProvider } from "../../services/bridges/entity-state-provider.js";
import { applyPatchState } from "../../utils/apply-patch-state.js";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";
import type { ValueGetter, ValueSetter } from "./utils/cluster-config.js";

const logger = Logger.get("RvcRunModeServer");

export enum RvcSupportedRunMode {
  Idle = 0,
  Cleaning = 1,
}

export interface RvcRunModeServerConfig {
  getCurrentMode: ValueGetter<RvcSupportedRunMode>;
  getSupportedModes: ValueGetter<RvcRunMode.ModeOption[]>;

  start: ValueSetter<void>;
  returnToBase: ValueSetter<void>;
  pause: ValueSetter<void>;
  /** Optional: Clean a specific room by mode value */
  cleanRoom?: ValueSetter<number>;
}

export interface RvcRunModeServerInitialState {
  supportedModes: RvcRunMode.ModeOption[];
  currentMode: number;
}

/** Base mode value for room-specific cleaning modes */
export const ROOM_MODE_BASE = 100;

/** Check if a mode value represents a room-specific cleaning mode */
export function isRoomMode(mode: number): boolean {
  return mode >= ROOM_MODE_BASE;
}

// biome-ignore lint/correctness/noUnusedVariables: Biome thinks this is unused, but it's used by the function below
class RvcRunModeServerBase extends Base {
  declare state: RvcRunModeServerBase.State;

  /** Areas that the vacuum has already finished cleaning in this session */
  private completedAreas = new Set<number>();
  /** Last known currentArea — used to detect room transitions */
  private lastCurrentArea: number | null = null;
  /** Snapshot of selectedAreas taken when cleaning starts.
   *  The start handler clears serviceArea.state.selectedAreas after
   *  dispatching the HA action to prevent re-dispatch, but progress
   *  tracking needs the original list for the entire cleaning session. */
  private activeAreas: number[] = [];

  override async initialize() {
    // supportedModes and currentMode are set via .set() BEFORE initialize is called
    // This ensures Matter.js has the modes at pairing time
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update(entity: HomeAssistantEntityInformation) {
    if (!entity.state) {
      return;
    }
    const previousMode = this.state.currentMode;
    const newMode = this.state.config.getCurrentMode(entity.state, this.agent);

    applyPatchState(
      this.state,
      {
        currentMode: newMode,
        supportedModes: this.state.config.getSupportedModes(
          entity.state,
          this.agent,
        ),
      },
      { force: true },
    );

    if (previousMode !== newMode) {
      if (newMode === RvcSupportedRunMode.Idle) {
        // Mark all areas as Completed and reset per-room tracking.
        // Keep activeAreas intact — Dreame (and other vacuums) may
        // briefly transition through Idle between rooms, and the
        // Cleaning restore below needs activeAreas to recover.
        // activeAreas is overwritten on the next changeToMode call.
        this.trySetCurrentArea(null);
        this.completedAreas.clear();
        this.lastCurrentArea = null;
      } else if (newMode === RvcSupportedRunMode.Cleaning) {
        // Restore currentArea when HA reports cleaning (e.g. after a brief
        // docked state between command dispatch and vacuum actually starting,
        // or when the vacuum transitions between rooms via a non-cleaning state)
        if (this.activeAreas.length > 0 && this.lastCurrentArea === null) {
          this.trySetCurrentArea(this.activeAreas[0]);
        }
      }
    }

    // Dynamic room tracking: when cleaning and a currentRoomEntity is
    // configured, read the sensor to update currentArea in real time.
    if (newMode === RvcSupportedRunMode.Cleaning) {
      this.updateCurrentRoomFromSensor();
    }
  }

  /**
   * Read the currentRoomEntity sensor and update currentArea + progress
   * to reflect which room the vacuum is actually in right now.
   */
  private updateCurrentRoomFromSensor() {
    try {
      const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
      const currentRoomEntityId =
        homeAssistant.state.mapping?.currentRoomEntity;
      if (!currentRoomEntityId) return;

      const stateProvider = this.agent.env.get(EntityStateProvider);
      const roomState = stateProvider.getState(currentRoomEntityId);
      if (!roomState || !roomState.state) return;

      if (this.activeAreas.length === 0) return;

      const serviceArea = this.agent.get(ServiceAreaBehavior);

      // Match by numeric room/segment ID (preferred) or by room name.
      // Dreame sensors use "room_id", others may use "segment_id".
      const sensorAttrs = roomState.attributes as {
        segment_id?: number;
        room_id?: number;
      };
      const segmentId = sensorAttrs.segment_id ?? sensorAttrs.room_id;
      const roomName = roomState.state;

      let matchedAreaId: number | null = null;

      // Strategy 1: Direct segmentId → activeAreas match.
      // Works when areaId === room_id (e.g. Dreame floor 0).
      if (segmentId != null) {
        if (this.activeAreas.includes(segmentId)) {
          matchedAreaId = segmentId;
        }
      }

      // Strategy 2: Look up segmentId in supportedAreas to find the
      // corresponding areaId. Dreame multi-floor vacuums offset room IDs
      // per floor (areaId = floorIndex * 10000 + room_id), so the raw
      // sensor room_id won't match activeAreas directly for floor > 0.
      // Also handles cases where areaId is a hash of a string room ID.
      if (matchedAreaId === null && segmentId != null) {
        for (const area of serviceArea.state.supportedAreas) {
          // areaId % 10000 recovers the original per-floor room_id
          // for Dreame multi-floor; for single-floor, areaId === room_id.
          if (
            this.activeAreas.includes(area.areaId) &&
            area.areaId % 10000 === segmentId
          ) {
            matchedAreaId = area.areaId;
            break;
          }
        }
      }

      // Strategy 3: Match by location name in supportedAreas.
      if (matchedAreaId === null && roomName) {
        const area = serviceArea.state.supportedAreas.find(
          (a) =>
            a.areaInfo.locationInfo?.locationName?.toLowerCase() ===
            roomName.toLowerCase(),
        );
        if (area && this.activeAreas.includes(area.areaId)) {
          matchedAreaId = area.areaId;
        }
      }

      if (matchedAreaId === null) {
        logger.info(
          `currentRoom sensor: no match for "${roomName}" (segmentId=${segmentId}), ` +
            `activeAreas=[${this.activeAreas.join(", ")}], ` +
            `supportedAreas=[${serviceArea.state.supportedAreas.map((a) => `${a.areaId}:${a.areaInfo.locationInfo?.locationName}`).join(", ")}]`,
        );
        return;
      }
      if (matchedAreaId === this.lastCurrentArea) return;

      // Room transition detected — mark previous area as completed
      if (this.lastCurrentArea !== null) {
        this.completedAreas.add(this.lastCurrentArea);
      }
      this.lastCurrentArea = matchedAreaId;

      logger.info(
        `currentRoom sensor: transition to area ${matchedAreaId} ("${roomName}"), ` +
          `completed: [${[...this.completedAreas].join(", ")}]`,
      );

      this.trySetCurrentArea(matchedAreaId);
    } catch (e) {
      // Only suppress expected errors (EntityStateProvider or ServiceArea not available)
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("No provider for") && !msg.includes("not supported")) {
        logger.warn(`currentRoom sensor update failed: ${msg}`);
      }
    }
  }

  /**
   * Safely update ServiceArea.currentArea and progress.
   * When areaId is set, marks it as Operating in progress.
   * When areaId is null (Idle), marks all Operating/Pending as Completed.
   * No-op if ServiceArea is not available on this endpoint.
   */
  private trySetCurrentArea(areaId: number | null) {
    try {
      const serviceArea = this.agent.get(ServiceAreaBehavior);
      if (serviceArea.state.currentArea !== areaId) {
        serviceArea.state.currentArea = areaId;
        logger.debug(`currentArea set to ${areaId}`);
      }
      this.updateProgress(serviceArea, areaId);
    } catch {
      // ServiceArea not available on this endpoint
    }
  }

  /**
   * Update progress entries to reflect the current operating area.
   * - null: mark all areas as Completed (cleaning done)
   * - areaId: mark that area as Operating, others as Pending
   *
   * Uses the activeAreas snapshot (plain number array) instead of
   * managed state entries, which avoids infinite recursion in
   * matter.js property getters during transaction pre-commit.
   */
  private updateProgress(
    serviceArea: InstanceType<typeof ServiceAreaBehavior>,
    areaId: number | null,
  ) {
    if (this.activeAreas.length === 0) return;

    const state = serviceArea.state as typeof serviceArea.state & {
      progress?: ServiceArea.Progress[];
    };

    if (areaId === null) {
      // Cleaning finished — mark all active areas as Completed
      state.progress = this.activeAreas.map((id) => ({
        areaId: id,
        status: ServiceArea.OperationalStatus.Completed,
      }));
    } else {
      // Mark current area as Operating, completed areas as Completed,
      // remaining areas as Pending.
      state.progress = this.activeAreas.map((id) => ({
        areaId: id,
        status:
          id === areaId
            ? ServiceArea.OperationalStatus.Operating
            : this.completedAreas.has(id)
              ? ServiceArea.OperationalStatus.Completed
              : ServiceArea.OperationalStatus.Pending,
      }));
    }
  }

  /**
   * Find the ServiceArea area ID that corresponds to a run mode value
   * by matching the mode label to the area location name.
   */
  private findAreaIdForMode(mode: number): number | null {
    try {
      const serviceArea = this.agent.get(ServiceAreaBehavior);
      const modeEntry = this.state.supportedModes.find((m) => m.mode === mode);
      if (!modeEntry) return null;

      const area = serviceArea.state.supportedAreas.find(
        (a) => a.areaInfo.locationInfo?.locationName === modeEntry.label,
      );
      return area?.areaId ?? null;
    } catch {
      return null;
    }
  }

  override changeToMode(
    request: ModeBase.ChangeToModeRequest,
  ): ModeBase.ChangeToModeResponse {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const { newMode } = request;

    // Validate mode exists in supportedModes (matches matter.js base behavior)
    if (
      newMode !== this.state.currentMode &&
      !this.state.supportedModes.some((m) => m.mode === newMode)
    ) {
      return {
        status: ModeBase.ModeChangeStatus.UnsupportedMode,
        statusText: `Unsupported mode: ${newMode}`,
      };
    }

    // Check for room-specific cleaning mode
    if (isRoomMode(newMode)) {
      // When selectedAreas exist (e.g. Apple Home sends selectAreas before
      // changeToMode), prefer area-based cleaning over mode-based room selection.
      try {
        const serviceArea = this.agent.get(ServiceAreaBehavior);
        if (serviceArea.state.selectedAreas?.length > 0) {
          // Snapshot selected areas before the start handler clears them
          this.activeAreas = [...serviceArea.state.selectedAreas];
          this.trySetCurrentArea(this.activeAreas[0]);
          homeAssistant.callAction(this.state.config.start(void 0, this.agent));
          this.state.currentMode = newMode;
          return {
            status: ModeBase.ModeChangeStatus.Success,
            statusText: "Starting room cleaning",
          };
        }
      } catch {
        // ServiceArea not available, fall through to mode-based room cleaning
      }

      if (this.state.config.cleanRoom) {
        const areaId = this.findAreaIdForMode(newMode);
        this.activeAreas = areaId !== null ? [areaId] : [];
        this.trySetCurrentArea(areaId);
        homeAssistant.callAction(
          this.state.config.cleanRoom(newMode, this.agent),
        );
        this.state.currentMode = newMode;
        return {
          status: ModeBase.ModeChangeStatus.Success,
          statusText: "Starting room cleaning",
        };
      }
    }

    switch (newMode) {
      case RvcSupportedRunMode.Cleaning: {
        // Set currentArea from selectedAreas if a controller pre-selected areas
        try {
          const serviceArea = this.agent.get(ServiceAreaBehavior);
          if (serviceArea.state.selectedAreas?.length > 0) {
            this.activeAreas = [...serviceArea.state.selectedAreas];
            this.trySetCurrentArea(this.activeAreas[0]);
          }
        } catch {
          // ServiceArea not available
        }
        homeAssistant.callAction(this.state.config.start(void 0, this.agent));
        break;
      }
      case RvcSupportedRunMode.Idle:
        // Explicit user command to stop — clear session state
        this.trySetCurrentArea(null);
        this.completedAreas.clear();
        this.lastCurrentArea = null;
        this.activeAreas = [];
        homeAssistant.callAction(
          this.state.config.returnToBase(void 0, this.agent),
        );
        break;
      default:
        homeAssistant.callAction(this.state.config.pause(void 0, this.agent));
        break;
    }
    this.state.currentMode = newMode;
    return {
      status: ModeBase.ModeChangeStatus.Success,
      statusText: "Successfully switched mode",
    };
  }
}

namespace RvcRunModeServerBase {
  export class State extends Base.State {
    config!: RvcRunModeServerConfig;
  }
}

/**
 * Create an RvcRunMode behavior with initial state.
 * The initialState MUST include supportedModes - Matter.js requires this at pairing time.
 */
export function RvcRunModeServer(
  config: RvcRunModeServerConfig,
  initialState?: RvcRunModeServerInitialState,
) {
  const defaultModes: RvcRunMode.ModeOption[] = [
    {
      label: "Idle",
      mode: RvcSupportedRunMode.Idle,
      modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
    },
    {
      label: "Cleaning",
      mode: RvcSupportedRunMode.Cleaning,
      modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
    },
  ];

  return RvcRunModeServerBase.set({
    config,
    supportedModes: initialState?.supportedModes ?? defaultModes,
    currentMode: initialState?.currentMode ?? RvcSupportedRunMode.Idle,
  });
}
