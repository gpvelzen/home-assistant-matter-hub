import {
  type CustomServiceArea,
  type VacuumDeviceAttributes,
  VacuumDeviceFeature,
  VacuumState,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { Agent } from "@matter/main";
import { ServiceAreaBehavior } from "@matter/main/behaviors";
import { RvcRunMode } from "@matter/main/clusters";
import { testBit } from "../../../../../utils/test-bit.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  RvcRunModeServer,
  RvcSupportedRunMode,
} from "../../../../behaviors/rvc-run-mode-server.js";
import {
  getRoomIdFromMode,
  getRoomModeValue,
  isDreameVacuum,
  isEcovacsVacuum,
  isRoborockVacuum,
  isXiaomiMiotVacuum,
  parseVacuumRooms,
  ROOM_MODE_BASE,
} from "../utils/parse-vacuum-rooms.js";
import { toAreaId } from "./vacuum-service-area-server.js";

const logger = Logger.get("VacuumRvcRunModeServer");

/**
 * Build supported modes from vacuum attributes.
 * This includes base modes (Idle, Cleaning) plus room-specific modes if available.
 *
 * @param attributes - Vacuum device attributes
 * @param includeUnnamedRooms - If true, includes rooms with generic names like "Room 7". Default: false
 */
function buildSupportedModes(
  attributes: VacuumDeviceAttributes,
  includeUnnamedRooms = false,
  customAreas?: CustomServiceArea[],
): RvcRunMode.ModeOption[] {
  const modes: RvcRunMode.ModeOption[] = [
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

  // Apple Home does not call ServiceArea.selectAreas before changeToMode,
  // so room modes in RvcRunMode are the only way to trigger room cleaning.
  // ServiceArea rooms are kept as well for controllers that do support it.
  //
  // IMPORTANT: Sort rooms/areas alphabetically by name. Apple Home displays
  // modes sorted alphabetically but uses positional indexing into the
  // original mode array when calling changeToMode, so registration order
  // must match.

  if (customAreas && customAreas.length > 0) {
    // Custom service areas replace parsed rooms for mode generation.
    // Mode values use ROOM_MODE_BASE + (1-based sorted index) to stay
    // consistent with createCustomServiceAreaServer area IDs after sorting.
    const sorted = [...customAreas].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (let i = 0; i < sorted.length; i++) {
      const modeValue = ROOM_MODE_BASE + i + 1;
      if (modeValue > 255) continue;
      modes.push({
        label: sorted[i].name,
        mode: modeValue,
        modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
      });
    }
  } else {
    // Regular room modes from vacuum attributes (Dreame, Roborock, etc.)
    const rooms = parseVacuumRooms(attributes, includeUnnamedRooms);
    rooms.sort((a, b) => a.name.localeCompare(b.name));
    for (const room of rooms) {
      const modeValue = getRoomModeValue(room);
      // Mode values must fit in uint8 (Matter spec: ModeBase mode is uint8)
      if (modeValue > 255) continue;
      modes.push({
        label: room.name,
        mode: modeValue,
        modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
      });
    }
  }

  return modes;
}

/**
 * Handle custom service areas: call the configured HA service for each selected area.
 * Custom areas use sequential IDs (1, 2, 3...) matching createCustomServiceAreaServer.
 */
function handleCustomServiceAreas(
  selectedAreas: number[],
  customAreas: CustomServiceArea[],
  homeAssistant: HomeAssistantEntityBehavior,
  serviceArea: { state: { selectedAreas: number[] } },
) {
  // Map area IDs back to custom area configs (IDs are 1-based index)
  const matched = selectedAreas
    .map((areaId) => customAreas[areaId - 1])
    .filter(Boolean);

  // Clear selected areas after mapping (not before — a proxied
  // reference would be invalidated by Datasource subref refresh).
  serviceArea.state.selectedAreas = [];

  if (matched.length === 0) {
    logger.warn(
      `Custom service areas: no match for selected IDs ${selectedAreas.join(", ")}`,
    );
    return { action: "vacuum.start" };
  }

  logger.info(
    `Custom service areas: calling ${matched.length} service(s): ${matched.map((a) => `${a.service} (${a.name})`).join(", ")}`,
  );

  // Dispatch additional areas (2..N) directly
  for (let i = 1; i < matched.length; i++) {
    const area = matched[i];
    homeAssistant.callAction({
      action: area.service,
      target: area.target,
      data: area.data,
    });
  }

  // Return the first area as the primary action
  const first = matched[0];
  return {
    action: first.service,
    target: first.target,
    data: first.data,
  };
}

const vacuumRvcRunModeConfig = {
  getCurrentMode: (entity: { state: string }) => {
    const state = entity.state as VacuumState;
    // All cleaning-related states should map to Cleaning mode
    const cleaningStates: string[] = [
      VacuumState.cleaning,
      VacuumState.segment_cleaning,
      VacuumState.zone_cleaning,
      VacuumState.spot_cleaning,
      VacuumState.mop_cleaning,
    ];
    const isCleaning = cleaningStates.includes(state);
    logger.debug(
      `Vacuum state: "${state}", isCleaning: ${isCleaning}, currentMode: ${isCleaning ? "Cleaning" : "Idle"}`,
    );
    return isCleaning ? RvcSupportedRunMode.Cleaning : RvcSupportedRunMode.Idle;
  },

  getSupportedModes: (entity: { attributes: unknown }) => {
    const attributes = entity.attributes as VacuumDeviceAttributes;
    return buildSupportedModes(attributes);
  },

  // biome-ignore lint/suspicious/noConfusingVoidType: Required by ValueSetter<void> interface
  start: (_: void, agent: Agent) => {
    // Check if there are selected areas from ServiceArea
    try {
      const serviceArea = agent.get(ServiceAreaBehavior);
      // IMPORTANT: Snapshot-copy the array. Matter.js managed state
      // returns proxied arrays; clearing the state later would
      // invalidate a live reference (Datasource subref refresh).
      const selectedAreas = [...serviceArea.state.selectedAreas];

      if (selectedAreas.length > 0) {
        const homeAssistant = agent.get(HomeAssistantEntityBehavior);
        const entity = homeAssistant.entity;
        const attributes = entity.state.attributes as VacuumDeviceAttributes;

        // Check for user-defined custom service areas first (lawn mowers, generic zone robots)
        const customAreas = homeAssistant.state.mapping?.customServiceAreas;
        if (customAreas && customAreas.length > 0) {
          return handleCustomServiceAreas(
            selectedAreas,
            customAreas,
            homeAssistant,
            serviceArea,
          );
        }

        // Check if we have button entities mapped for rooms (Roborock integration)
        const roomEntities = homeAssistant.state.mapping?.roomEntities;
        if (roomEntities && roomEntities.length > 0) {
          // Find button entity IDs for selected areas
          const buttonEntityIds: string[] = [];
          for (const areaId of selectedAreas) {
            const buttonEntityId = roomEntities.find(
              (id) => toAreaId(id) === areaId,
            );
            if (buttonEntityId) {
              buttonEntityIds.push(buttonEntityId);
            }
          }

          if (buttonEntityIds.length > 0) {
            logger.info(
              `Roborock: Pressing button entities for selected rooms: ${buttonEntityIds.join(", ")}`,
            );

            // Clear selected areas after use
            serviceArea.state.selectedAreas = [];

            // Dispatch extra button presses directly — the caller can only
            // handle a single returned action, so press buttons 1..N here.
            for (let i = 1; i < buttonEntityIds.length; i++) {
              homeAssistant.callAction({
                action: "button.press",
                target: buttonEntityIds[i],
              });
            }

            return {
              action: "button.press",
              target: buttonEntityIds[0],
            };
          }
        }

        // Fallback: Try to find rooms from vacuum attributes (Dreame, Xiaomi Miot)
        const rooms = parseVacuumRooms(attributes);

        // Convert area IDs back to room IDs
        // Use originalId if available (Dreame multi-floor: id is deduplicated, originalId is per-floor)
        const roomIds: (string | number)[] = [];
        for (const areaId of selectedAreas) {
          const room = rooms.find((r) => toAreaId(r.id) === areaId);
          if (room) {
            roomIds.push(room.originalId ?? room.id);
          }
        }

        if (roomIds.length > 0) {
          logger.info(
            `Starting cleaning with selected areas: ${roomIds.join(", ")}`,
          );

          // Clear selected areas after use
          serviceArea.state.selectedAreas = [];

          // Valetudo vacuums use mqtt.publish to trigger segment cleanup.
          // vacuum.send_command is NOT supported by Valetudo's MQTT integration.
          const vacuumEntityId = homeAssistant.entityId;
          if (vacuumEntityId.startsWith("vacuum.valetudo_")) {
            const identifier = vacuumEntityId.replace(/^vacuum\.valetudo_/, "");
            logger.info(
              `Valetudo vacuum: Using mqtt.publish segment_cleanup for rooms: ${roomIds.join(", ")}`,
            );
            return {
              action: "mqtt.publish",
              target: false as const,
              data: {
                topic: `valetudo/${identifier}/MapSegmentationCapability/clean/set`,
                payload: JSON.stringify({
                  segment_ids: roomIds.map(String),
                  iterations: 1,
                  customOrder: true,
                }),
              },
            };
          }

          // Dreame vacuums use their own service
          if (isDreameVacuum(attributes)) {
            return {
              action: "dreame_vacuum.vacuum_clean_segment",
              data: {
                segments: roomIds.length === 1 ? roomIds[0] : roomIds,
              },
            };
          }

          // Roborock/Xiaomi Miot vacuums use vacuum.send_command with app_segment_clean
          if (isRoborockVacuum(attributes) || isXiaomiMiotVacuum(attributes)) {
            return {
              action: "vacuum.send_command",
              data: {
                command: "app_segment_clean",
                params: roomIds,
              },
            };
          }

          // Ecovacs/Deebot vacuums use vacuum.send_command with spot_area
          // Params must be a dict (not a list) with comma-separated room IDs as string
          if (isEcovacsVacuum(attributes)) {
            const roomIdStr = roomIds.join(",");
            logger.info(
              `Ecovacs vacuum: Using spot_area for rooms: ${roomIdStr}`,
            );
            return {
              action: "vacuum.send_command",
              data: {
                command: "spot_area",
                params: {
                  mapID: 0,
                  cleanings: 1,
                  rooms: roomIdStr,
                },
              },
            };
          }

          // Unknown vacuum type - fall back to regular start.
          // app_segment_clean is Roborock-specific and will fail on other
          // integrations (e.g. Ecovacs/Deebot rejects list params).
          logger.warn(
            `Room cleaning via send_command not supported for this vacuum type. Rooms: ${roomIds.join(", ")}. Falling back to vacuum.start`,
          );
        }
      }
    } catch {
      // ServiceArea not available, fall through to regular start
    }

    logger.info("Starting regular cleaning (no areas selected)");
    return { action: "vacuum.start" };
  },
  returnToBase: () => ({ action: "vacuum.return_to_base" }),
  pause: (
    // biome-ignore lint/suspicious/noConfusingVoidType: Required by ValueSetter<void> interface
    _: void,
    agent: {
      get: (
        type: typeof HomeAssistantEntityBehavior,
      ) => HomeAssistantEntityBehavior;
    },
  ) => {
    const supportedFeatures =
      agent.get(HomeAssistantEntityBehavior).entity.state.attributes
        .supported_features ?? 0;
    if (testBit(supportedFeatures, VacuumDeviceFeature.PAUSE)) {
      return { action: "vacuum.pause" };
    }
    return { action: "vacuum.stop" };
  },

  cleanRoom: (
    roomMode: number,
    agent: {
      get: (
        type: typeof HomeAssistantEntityBehavior,
      ) => HomeAssistantEntityBehavior;
    },
  ) => {
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const entity = homeAssistant.entity;
    const attributes = entity.state.attributes as VacuumDeviceAttributes;

    logger.info(`cleanRoom called: roomMode=${roomMode}`);

    // Handle user-defined custom service areas first (lawn mowers, generic zone robots).
    // Mode values for custom areas: ROOM_MODE_BASE + (1-based sorted index).
    const customAreas = homeAssistant.state.mapping?.customServiceAreas;
    if (customAreas && customAreas.length > 0) {
      const sorted = [...customAreas].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const areaIndex = roomMode - ROOM_MODE_BASE - 1;
      if (areaIndex >= 0 && areaIndex < sorted.length) {
        const area = sorted[areaIndex];
        logger.info(
          `cleanRoom: custom service area "${area.name}" → ${area.service}`,
        );
        return {
          action: area.service,
          target: area.target,
          data: area.data,
        };
      }
    }

    // Regular room handling from vacuum attributes (Dreame, Roborock, etc.)
    const rooms = parseVacuumRooms(attributes);
    const numericIdFromMode = getRoomIdFromMode(roomMode);

    logger.info(
      `cleanRoom: numericIdFromMode=${numericIdFromMode}, available rooms: ${JSON.stringify(rooms.map((r) => ({ id: r.id, name: r.name, modeValue: getRoomModeValue(r) })))}`,
    );

    // Find the room by matching mode value (ensures consistency)
    const room = rooms.find((r) => getRoomModeValue(r) === roomMode);

    if (room) {
      // Use originalId for commands (Dreame multi-floor: id is deduplicated, originalId is per-floor)
      const commandId = room.originalId ?? room.id;

      // Valetudo vacuums use mqtt.publish to trigger segment cleanup.
      // vacuum.send_command is NOT supported by Valetudo's MQTT integration.
      const vacuumEntityId = entity.entity_id;
      if (vacuumEntityId.startsWith("vacuum.valetudo_")) {
        const identifier = vacuumEntityId.replace(/^vacuum\.valetudo_/, "");
        logger.info(
          `Valetudo vacuum: Using mqtt.publish segment_cleanup for room ${room.name} (id: ${commandId})`,
        );
        return {
          action: "mqtt.publish",
          target: false as const,
          data: {
            topic: `valetudo/${identifier}/MapSegmentationCapability/clean/set`,
            payload: JSON.stringify({
              segment_ids: [String(commandId)],
              iterations: 1,
              customOrder: true,
            }),
          },
        };
      }

      // Dreame vacuums use their own service: dreame_vacuum.vacuum_clean_segment
      if (isDreameVacuum(attributes)) {
        logger.debug(
          `Dreame vacuum detected, using dreame_vacuum.vacuum_clean_segment for room ${room.name} (commandId: ${commandId}, id: ${room.id})`,
        );
        return {
          action: "dreame_vacuum.vacuum_clean_segment",
          data: {
            segments: commandId,
          },
        };
      }

      // Roborock/Xiaomi Miot vacuums use vacuum.send_command with app_segment_clean
      if (isRoborockVacuum(attributes) || isXiaomiMiotVacuum(attributes)) {
        logger.debug(
          `Using vacuum.send_command with app_segment_clean for room ${room.name} (commandId: ${commandId}, id: ${room.id})`,
        );
        return {
          action: "vacuum.send_command",
          data: {
            command: "app_segment_clean",
            params: [commandId],
          },
        };
      }

      // Ecovacs/Deebot vacuums use vacuum.send_command with spot_area
      if (isEcovacsVacuum(attributes)) {
        const roomIdStr = String(commandId);
        logger.info(
          `Ecovacs vacuum: Using spot_area for room ${room.name} (id: ${roomIdStr})`,
        );
        return {
          action: "vacuum.send_command",
          data: {
            command: "spot_area",
            params: {
              mapID: 0,
              cleanings: 1,
              rooms: roomIdStr,
            },
          },
        };
      }

      // Unknown vacuum type - fall back to regular start
      logger.warn(
        `Room cleaning via send_command not supported for this vacuum type. Room: ${room.name} (id=${commandId}). Falling back to vacuum.start`,
      );
    }
    return { action: "vacuum.start" };
  },
};

/**
 * Create a VacuumRvcRunModeServer with initial supportedModes.
 * The modes MUST be provided at creation time for Matter.js initialization.
 *
 * @param attributes - Vacuum device attributes
 * @param includeUnnamedRooms - If true, includes rooms with generic names like "Room 7". Default: false
 */
export function createVacuumRvcRunModeServer(
  attributes: VacuumDeviceAttributes,
  includeUnnamedRooms = false,
  customAreas?: CustomServiceArea[],
) {
  // Get all rooms first for logging
  const allRooms = parseVacuumRooms(attributes, true);
  const rooms = includeUnnamedRooms
    ? allRooms
    : parseVacuumRooms(attributes, false);
  const filteredCount = allRooms.length - rooms.length;

  const supportedModes = buildSupportedModes(
    attributes,
    includeUnnamedRooms,
    customAreas,
  );

  logger.info(
    `Creating VacuumRvcRunModeServer with ${rooms.length} rooms, ${supportedModes.length} total modes`,
  );
  if (rooms.length > 0) {
    logger.info(`Rooms found: ${rooms.map((r) => r.name).join(", ")}`);
  }
  if (filteredCount > 0) {
    const filtered = allRooms.filter((r) => !rooms.some((x) => x.id === r.id));
    logger.info(
      `Filtered out ${filteredCount} unnamed room(s): ${filtered.map((r) => r.name).join(", ")}`,
    );
  }
  if (allRooms.length === 0) {
    logger.debug(
      `No rooms found. Attributes: rooms=${JSON.stringify(attributes.rooms)}, segments=${JSON.stringify(attributes.segments)}, room_list=${attributes.room_list}`,
    );
  }

  return RvcRunModeServer(vacuumRvcRunModeConfig, {
    supportedModes,
    currentMode: RvcSupportedRunMode.Idle,
  });
}

/** @deprecated Use createVacuumRvcRunModeServer instead */
export const VacuumRvcRunModeServer = RvcRunModeServer(vacuumRvcRunModeConfig);
