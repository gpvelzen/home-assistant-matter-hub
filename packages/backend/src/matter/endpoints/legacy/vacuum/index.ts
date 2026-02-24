import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { EndpointType } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";

const logger = Logger.get("VacuumDevice");

import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { VacuumIdentifyServer } from "./behaviors/vacuum-identify-server.js";
import { VacuumOnOffServer } from "./behaviors/vacuum-on-off-server.js";
import { VacuumPowerSourceServer } from "./behaviors/vacuum-power-source-server.js";
import {
  createDefaultRvcCleanModeServer,
  createVacuumRvcCleanModeServer,
  resolveFanSpeedList,
  resolveMopIntensityList,
  supportsCleaningModes,
} from "./behaviors/vacuum-rvc-clean-mode-server.js";
import { VacuumRvcOperationalStateServer } from "./behaviors/vacuum-rvc-operational-state-server.js";
import { createVacuumRvcRunModeServer } from "./behaviors/vacuum-rvc-run-mode-server.js";
import {
  createCustomServiceAreaServer,
  createDefaultServiceAreaServer,
  createVacuumServiceAreaServer,
} from "./behaviors/vacuum-service-area-server.js";
import { parseVacuumRooms } from "./utils/parse-vacuum-rooms.js";

const VacuumEndpointType = RoboticVacuumCleanerDevice.with(
  BasicInformationServer,
  VacuumIdentifyServer,
  HomeAssistantEntityBehavior,
  VacuumRvcOperationalStateServer,
);

export function VacuumDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
  includeOnOff = false,
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

  // OnOff is NOT part of the RoboticVacuumCleaner device type spec.
  // Including it may confuse Apple Home's UI rendering (shows "Updating"
  // or renders as switch instead of vacuum). Only enabled via feature flag
  // for Alexa compatibility (maps OnOff to PowerController for start/stop).
  if (includeOnOff) {
    logger.info(`${entityId}: Adding OnOff cluster (vacuumOnOff flag enabled)`);
    device = device.with(VacuumOnOffServer);
  }

  // PowerSource — always included.
  // Controllers (Alexa, Apple Home) expect battery info on vacuum endpoints.
  device = device.with(VacuumPowerSourceServer);

  // ServiceArea — always included.
  // Controllers expect this cluster on vacuum endpoints.
  const customAreas = homeAssistantEntity.mapping?.customServiceAreas;
  const roomEntities = homeAssistantEntity.mapping?.roomEntities;
  const rooms = parseVacuumRooms(attributes);
  logger.info(
    `${entityId}: customAreas=${customAreas?.length ?? 0}, roomEntities=${JSON.stringify(roomEntities ?? [])}, parsedRooms=${rooms.length}`,
  );
  if (customAreas && customAreas.length > 0) {
    logger.info(
      `${entityId}: Adding ServiceArea (${customAreas.length} custom areas)`,
    );
    device = device.with(createCustomServiceAreaServer(customAreas));
  } else if (rooms.length > 0 || (roomEntities && roomEntities.length > 0)) {
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
  const fanSpeedList = resolveFanSpeedList(
    attributes,
    homeAssistantEntity.mapping?.suctionLevelEntity,
  );
  const mopIntensityList = resolveMopIntensityList(
    homeAssistantEntity.mapping?.mopIntensityEntity,
  );
  const hasCleanTypes =
    supportsCleaningModes(attributes) || hasCleaningModeEntity;
  if (hasCleanTypes || fanSpeedList || mopIntensityList) {
    logger.info(
      `${entityId}: Adding RvcCleanMode (multi-mode, hasCleanTypes=${hasCleanTypes}, fanSpeedList=${JSON.stringify(fanSpeedList ?? [])}, mopIntensityList=${JSON.stringify(mopIntensityList ?? [])})`,
    );
    device = device.with(
      createVacuumRvcCleanModeServer(
        attributes,
        fanSpeedList,
        mopIntensityList,
        hasCleanTypes,
      ),
    );
  } else {
    logger.info(`${entityId}: Adding RvcCleanMode (default single-mode)`);
    device = device.with(createDefaultRvcCleanModeServer());
  }

  return device;
}
