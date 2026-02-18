import type {
  VacuumDeviceAttributes,
  VacuumRoom,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { ServiceArea } from "@matter/main/clusters";
import { ServiceAreaServer } from "../../../../behaviors/service-area-server.js";
import { parseVacuumRooms } from "../utils/parse-vacuum-rooms.js";

const logger = Logger.get("VacuumServiceAreaServer");

/**
 * Convert vacuum room ID to a Matter-compatible area ID.
 * Room IDs from HA can be strings or numbers, but Matter requires uint32.
 */
function toAreaId(roomId: string | number): number {
  if (typeof roomId === "number") {
    return roomId;
  }
  // For string IDs, use a simple hash
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    const char = roomId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Convert VacuumRoom array to Matter ServiceArea.Area array
 */
function roomsToAreas(rooms: VacuumRoom[]): ServiceArea.Area[] {
  return rooms.map((room) => ({
    areaId: toAreaId(room.id),
    mapId: null,
    areaInfo: {
      locationInfo: {
        locationName: room.name,
        floorNumber: null,
        areaType: null,
      },
      landmarkInfo: null,
    },
  }));
}

/**
 * Build a lookup map from segment number to room name using room_mapping.
 * room_mapping format: [[segmentId, cloudRoomId, roomName], ...]
 */
function buildRoomNameLookup(
  attributes?: VacuumDeviceAttributes,
): Map<number, string> {
  const lookup = new Map<number, string>();
  const mapping = attributes?.room_mapping;
  if (!Array.isArray(mapping)) return lookup;

  for (const entry of mapping) {
    if (
      Array.isArray(entry) &&
      entry.length >= 3 &&
      (typeof entry[0] === "number" || typeof entry[0] === "string") &&
      typeof entry[2] === "string"
    ) {
      const segId =
        typeof entry[0] === "number"
          ? entry[0]
          : Number.parseInt(String(entry[0]), 10);
      if (!Number.isNaN(segId)) {
        lookup.set(segId, entry[2]);
      }
    }
  }
  return lookup;
}

/**
 * Convert button entity IDs to VacuumRoom array.
 * First tries to resolve names from room_mapping (Roborock segment -> name mapping),
 * then falls back to parsing the entity ID.
 * Example: "button.roborock_s6_6b8e_segment_18" + room_mapping -> { id: "...", name: "Badrum" }
 */
function buttonEntitiesToRooms(
  entityIds: string[],
  attributes?: VacuumDeviceAttributes,
): VacuumRoom[] {
  const nameLookup = buildRoomNameLookup(attributes);

  return entityIds.map((entityId) => {
    // Try to extract segment number and look up in room_mapping
    const segmentMatch = entityId.match(/segment[_-]?(\d+)$/);
    if (segmentMatch && nameLookup.size > 0) {
      const segId = Number.parseInt(segmentMatch[1], 10);
      const name = nameLookup.get(segId);
      if (name) {
        return { id: entityId, name };
      }
    }

    // Fallback: extract name from entity ID
    const parts = entityId.split(".");
    const lastPart = parts[parts.length - 1] || entityId;
    // Remove common prefixes like "roborock_clean_", "vacuum_", etc.
    const cleanName = lastPart
      .replace(/^(roborock_|vacuum_|clean_|room_)+/i, "")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return {
      id: entityId, // Use full entity ID as room ID for button press
      name: cleanName || lastPart,
    };
  });
}

/**
 * Create a VacuumServiceAreaServer with initial supportedAreas.
 * The areas MUST be provided at creation time for Matter.js initialization.
 * All state is set at creation time.
 *
 * Note: selectAreas only stores selected areas. Actual cleaning starts when
 * RvcRunMode.changeToMode(Cleaning) is called - the RvcRunModeServer reads
 * the selectedAreas from ServiceArea state and triggers the appropriate
 * vacuum service (dreame_vacuum.vacuum_clean_segment or vacuum.send_command).
 *
 * @param attributes - Vacuum device attributes
 * @param roomEntities - Optional array of button entity IDs for room-based cleaning (Roborock)
 * @param includeUnnamedRooms - If true, includes rooms with generic names like "Room 7". Default: false
 */
export function createVacuumServiceAreaServer(
  attributes: VacuumDeviceAttributes,
  roomEntities?: string[],
  includeUnnamedRooms = false,
) {
  let rooms: VacuumRoom[];

  // Prefer button entities if provided (Roborock integration)
  if (roomEntities && roomEntities.length > 0) {
    rooms = buttonEntitiesToRooms(roomEntities, attributes);
    logger.info(
      `Using ${rooms.length} button entities as rooms: ${rooms.map((r) => r.name).join(", ")}`,
    );
  } else {
    // Fallback to parsing rooms from vacuum attributes (Dreame, Xiaomi Miot, etc.)
    rooms = parseVacuumRooms(attributes, includeUnnamedRooms);
    if (rooms.length > 0) {
      logger.info(
        `Using ${rooms.length} rooms from attributes: ${rooms.map((r) => r.name).join(", ")}`,
      );
    }
  }

  const supportedAreas = roomsToAreas(rooms);

  return ServiceAreaServer({
    supportedAreas,
    selectedAreas: [],
    currentArea: null,
  });
}

/**
 * Export toAreaId for use by RvcRunModeServer to convert area IDs back to room IDs
 */
export { toAreaId };
