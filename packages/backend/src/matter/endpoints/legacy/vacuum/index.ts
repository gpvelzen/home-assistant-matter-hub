import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { EndpointType } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";

const logger = Logger.get("VacuumDevice");

import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { VacuumPowerSourceServer } from "./behaviors/vacuum-power-source-server.js";
import {
  createDefaultRvcCleanModeServer,
  createVacuumRvcCleanModeServer,
  supportsCleaningModes,
} from "./behaviors/vacuum-rvc-clean-mode-server.js";
import { VacuumRvcOperationalStateServer } from "./behaviors/vacuum-rvc-operational-state-server.js";
import { createVacuumRvcRunModeServer } from "./behaviors/vacuum-rvc-run-mode-server.js";
import {
  createDefaultServiceAreaServer,
  createVacuumServiceAreaServer,
} from "./behaviors/vacuum-service-area-server.js";
import { parseVacuumRooms } from "./utils/parse-vacuum-rooms.js";

const VacuumEndpointType = RoboticVacuumCleanerDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  VacuumRvcOperationalStateServer,
);

export function VacuumDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType | undefined {
  if (homeAssistantEntity.entity.state === undefined) {
    return undefined;
  }

  const entityId = homeAssistantEntity.entity.entity_id;
  const attributes = homeAssistantEntity.entity.state
    .attributes as VacuumDeviceAttributes;
  // Debug: Log mapping info
  logger.info(
    `Creating vacuum endpoint for ${entityId}, mapping: ${JSON.stringify(homeAssistantEntity.mapping ?? "none")}`,
  );

  // Add RvcRunModeServer with initial supportedModes (including room modes if available)
  let device = VacuumEndpointType.with(
    createVacuumRvcRunModeServer(attributes),
  ).set({ homeAssistantEntity });

  // NOTE: OnOff is intentionally NOT included.
  // It is not part of the RoboticVacuumCleaner device type spec and
  // non-standard clusters can confuse Apple Home's UI rendering.
  // When vacuum is idle, OnOff.onOff=false may cause Apple Home to show
  // "Updating" instead of using RvcOperationalState for the actual status.
  // Start/stop is handled via RvcRunMode.changeToMode(Cleaning/Idle).

  // PowerSource — always included.
  // Controllers (Alexa, Apple Home) expect battery info on vacuum endpoints.
  device = device.with(VacuumPowerSourceServer);

  // ServiceArea — always included.
  // Controllers expect this cluster on vacuum endpoints.
  const roomEntities = homeAssistantEntity.mapping?.roomEntities;
  const rooms = parseVacuumRooms(attributes);
  logger.info(
    `${entityId}: roomEntities=${JSON.stringify(roomEntities ?? [])}, parsedRooms=${rooms.length}`,
  );
  if (rooms.length > 0 || (roomEntities && roomEntities.length > 0)) {
    logger.info(`${entityId}: Adding ServiceArea (${rooms.length} rooms)`);
    device = device.with(
      createVacuumServiceAreaServer(attributes, roomEntities),
    );
  } else {
    logger.info(`${entityId}: Adding ServiceArea (default single-area)`);
    device = device.with(createDefaultServiceAreaServer());
  }

  // RvcCleanMode — always included.
  // Alexa probes for cluster 0x55 during discovery and may refuse the device without it.
  const hasCleaningModeEntity =
    !!homeAssistantEntity.mapping?.cleaningModeEntity;
  const hasSuctionLevel = !!homeAssistantEntity.mapping?.suctionLevelEntity;
  if (supportsCleaningModes(attributes) || hasCleaningModeEntity) {
    logger.info(
      `${entityId}: Adding RvcCleanMode (multi-mode, isDreame=${supportsCleaningModes(attributes)}, mappedEntity=${hasCleaningModeEntity}, suction=${hasSuctionLevel})`,
    );
    device = device.with(
      createVacuumRvcCleanModeServer(attributes, hasSuctionLevel),
    );
  } else {
    logger.info(`${entityId}: Adding RvcCleanMode (default single-mode)`);
    device = device.with(createDefaultRvcCleanModeServer());
  }

  return device;
}
