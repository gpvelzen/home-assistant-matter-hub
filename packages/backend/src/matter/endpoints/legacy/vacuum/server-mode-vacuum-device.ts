import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import type { EndpointType } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { VacuumIdentifyServer } from "./behaviors/vacuum-identify-server.js";
import { VacuumOnOffServer } from "./behaviors/vacuum-on-off-server.js";
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
  createVacuumServiceAreaServer,
} from "./behaviors/vacuum-service-area-server.js";
import { parseVacuumRooms } from "./utils/parse-vacuum-rooms.js";

/**
 * Server Mode Vacuum Endpoint Type.
 *
 * This is different from the normal VacuumDevice:
 * - NO BridgedDeviceBasicInformationServer (BasicInformationServer)
 * - NO OnOff cluster (not part of RoboticVacuumCleaner device type spec)
 * - The device appears as a standalone Matter device, not bridged
 * - Required for Apple Home Siri voice commands and Alexa discovery
 *
 * Only clusters from the Matter RoboticVacuumCleaner device type (0x74) are included:
 * Required: Identify, RvcRunMode, RvcOperationalState
 * Optional: RvcCleanMode, ServiceArea, OnOff
 *
 * The BasicInformation comes from the ServerNode itself, not the endpoint.
 */
const ServerModeVacuumEndpointType = RoboticVacuumCleanerDevice.with(
  VacuumIdentifyServer,
  HomeAssistantEntityBehavior,
  VacuumRvcOperationalStateServer,
);

/**
 * Creates a Server Mode Vacuum Device endpoint.
 *
 * Unlike the bridged VacuumDevice, this version does NOT include
 * BridgedDeviceBasicInformationServer, making it appear as a
 * standalone (non-bridged) Matter device.
 */
export function ServerModeVacuumDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
  includeOnOff = false,
): EndpointType | undefined {
  if (homeAssistantEntity.entity.state === undefined) {
    return undefined;
  }

  const attributes = homeAssistantEntity.entity.state
    .attributes as VacuumDeviceAttributes;

  // Add RvcRunModeServer with initial supportedModes (including room modes if available)
  let device = ServerModeVacuumEndpointType.with(
    createVacuumRvcRunModeServer(attributes),
  ).set({ homeAssistantEntity });

  // OnOff is NOT part of the RoboticVacuumCleaner device type spec, but
  // Amazon Alexa REQUIRES PowerController (mapped from OnOff) for robotic
  // vacuum devices. Without it, the device commissions but never appears
  // in the Alexa app. Included by default in server mode; users can
  // disable via feature flag if it causes Apple Home UI issues.
  if (includeOnOff) {
    device = device.with(VacuumOnOffServer);
  }

  // PowerSource is intentionally NOT included in server mode.
  // Including it adds device type 0x0011 to the descriptor alongside 0x0074,
  // and Alexa may not handle multiple device types on an RVC endpoint.

  // ServiceArea — only included when rooms or custom areas are configured.
  // Omitted for vacuums without room data to avoid exposing an unnecessary
  // cluster that some controllers (Alexa) may not handle gracefully.
  const customAreas = homeAssistantEntity.mapping?.customServiceAreas;
  const roomEntities = homeAssistantEntity.mapping?.roomEntities;
  const rooms = parseVacuumRooms(attributes);
  if (customAreas && customAreas.length > 0) {
    device = device.with(createCustomServiceAreaServer(customAreas));
  } else if (rooms.length > 0 || (roomEntities && roomEntities.length > 0)) {
    device = device.with(
      createVacuumServiceAreaServer(attributes, roomEntities),
    );
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
    device = device.with(
      createVacuumRvcCleanModeServer(
        attributes,
        fanSpeedList,
        mopIntensityList,
        hasCleanTypes,
      ),
    );
  } else {
    device = device.with(createDefaultRvcCleanModeServer());
  }

  return device;
}
