import { Logger } from "@matter/general";
import { ServiceAreaBehavior } from "@matter/main/behaviors";
import { ServiceArea } from "@matter/main/clusters";

const logger = Logger.get("ServiceAreaServer");

/**
 * ServiceArea server implementation:
 * - No custom initialize() that calls super.initialize()
 * - Only override command handlers
 * - State is set via .set() at endpoint creation time
 */
export class ServiceAreaServerBase extends ServiceAreaBehavior {
  declare state: ServiceAreaServerBase.State;

  override selectAreas(
    request: ServiceArea.SelectAreasRequest,
  ): ServiceArea.SelectAreasResponse {
    const { newAreas } = request;

    logger.info(
      `ServiceArea selectAreas called with: ${JSON.stringify(newAreas)}`,
    );

    // Remove duplicates
    const uniqueAreas = [...new Set(newAreas)];

    // Validate that all requested areas exist in supportedAreas
    const supportedAreaIds = this.state.supportedAreas.map((a) => a.areaId);
    const invalidAreas = uniqueAreas.filter(
      (id) => !supportedAreaIds.includes(id),
    );

    if (invalidAreas.length > 0) {
      logger.warn(`Invalid area IDs requested: ${invalidAreas.join(", ")}`);
      return {
        status: ServiceArea.SelectAreasStatus.UnsupportedArea,
        statusText: `Invalid area IDs: ${invalidAreas.join(", ")}`,
      };
    }

    // Store selected areas - actual cleaning starts when RvcRunMode.changeToMode(Cleaning) is called
    this.state.selectedAreas = uniqueAreas;

    logger.info(
      `ServiceArea: Stored ${uniqueAreas.length} areas for cleaning: ${uniqueAreas.join(", ")}`,
    );
    return {
      status: ServiceArea.SelectAreasStatus.Success,
      statusText: "Areas selected for cleaning",
    };
  }

  override skipArea(
    _request: ServiceArea.SkipAreaRequest,
  ): ServiceArea.SkipAreaResponse {
    // Skip area is not commonly supported by vacuum integrations
    return {
      status: ServiceArea.SkipAreaStatus.InvalidInMode,
      statusText: "Skip area not supported",
    };
  }
}

export namespace ServiceAreaServerBase {
  export class State extends ServiceAreaBehavior.State {}
}

export interface ServiceAreaServerInitialState {
  supportedAreas: ServiceArea.Area[];
  selectedAreas?: number[];
  currentArea?: number | null;
}

/**
 * Create a ServiceArea behavior with initial state.
 * State is set at creation, no custom initialize().
 * The initialState MUST include supportedAreas - Matter.js requires this at pairing time.
 *
 * Note: selectAreas only stores the selected areas. Actual cleaning starts when
 * RvcRunMode.changeToMode(Cleaning) is called - the RvcRunModeServer reads
 * the selectedAreas from this behavior's state.
 */
export function ServiceAreaServer(initialState: ServiceAreaServerInitialState) {
  logger.info(
    `Creating ServiceAreaServer with ${initialState.supportedAreas.length} areas`,
  );
  return ServiceAreaServerBase.set({
    supportedAreas: initialState.supportedAreas,
    selectedAreas: initialState.selectedAreas ?? [],
    currentArea: initialState.currentArea ?? null,
  });
}

// --- Maps-enabled variant ---

const ServiceAreaWithMaps = ServiceAreaBehavior.with(ServiceArea.Feature.Maps);

/**
 * ServiceArea server with Maps feature enabled.
 * Allows controllers to group and filter areas by map/floor.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used via .set() in factory function below
class ServiceAreaServerWithMapsBase extends ServiceAreaWithMaps {
  declare state: ServiceAreaServerWithMapsBase.State;

  override selectAreas(
    request: ServiceArea.SelectAreasRequest,
  ): ServiceArea.SelectAreasResponse {
    const { newAreas } = request;

    logger.info(
      `ServiceArea selectAreas called with: ${JSON.stringify(newAreas)}`,
    );

    const uniqueAreas = [...new Set(newAreas)];

    const supportedAreaIds = this.state.supportedAreas.map((a) => a.areaId);
    const invalidAreas = uniqueAreas.filter(
      (id) => !supportedAreaIds.includes(id),
    );

    if (invalidAreas.length > 0) {
      logger.warn(`Invalid area IDs requested: ${invalidAreas.join(", ")}`);
      return {
        status: ServiceArea.SelectAreasStatus.UnsupportedArea,
        statusText: `Invalid area IDs: ${invalidAreas.join(", ")}`,
      };
    }

    this.state.selectedAreas = uniqueAreas;

    logger.info(
      `ServiceArea: Stored ${uniqueAreas.length} areas for cleaning: ${uniqueAreas.join(", ")}`,
    );
    return {
      status: ServiceArea.SelectAreasStatus.Success,
      statusText: "Areas selected for cleaning",
    };
  }

  override skipArea(
    _request: ServiceArea.SkipAreaRequest,
  ): ServiceArea.SkipAreaResponse {
    return {
      status: ServiceArea.SkipAreaStatus.InvalidInMode,
      statusText: "Skip area not supported",
    };
  }
}

namespace ServiceAreaServerWithMapsBase {
  export class State extends ServiceAreaWithMaps.State {}
}

export interface ServiceAreaServerWithMapsInitialState
  extends ServiceAreaServerInitialState {
  supportedMaps: ServiceArea.Map[];
}

/**
 * Create a ServiceArea behavior with Maps feature and initial state.
 * Used when rooms have floor/map info (e.g. Dreame multi-floor vacuums).
 * Controllers can group and filter rooms by floor when Maps is enabled.
 */
export function ServiceAreaServerWithMaps(
  initialState: ServiceAreaServerWithMapsInitialState,
) {
  logger.info(
    `Creating ServiceAreaServer with Maps: ${initialState.supportedAreas.length} areas, ${initialState.supportedMaps.length} maps`,
  );
  for (const map of initialState.supportedMaps) {
    const areaCount = initialState.supportedAreas.filter(
      (a) => a.mapId === map.mapId,
    ).length;
    logger.info(`  Map ${map.mapId}: "${map.name}" (${areaCount} areas)`);
  }
  return ServiceAreaServerWithMapsBase.set({
    supportedAreas: initialState.supportedAreas,
    supportedMaps: initialState.supportedMaps,
    selectedAreas: initialState.selectedAreas ?? [],
    currentArea: initialState.currentArea ?? null,
  });
}
