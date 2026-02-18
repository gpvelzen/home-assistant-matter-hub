import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { Agent } from "@matter/main";
import { RvcCleanMode } from "@matter/main/clusters";
import { EntityStateProvider } from "../../../../../services/bridges/entity-state-provider.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  RvcCleanModeServer,
  type RvcCleanModeServerInitialState,
} from "../../../../behaviors/rvc-clean-mode-server.js";
import {
  isDreameVacuum,
  isEcovacsVacuum,
} from "../utils/parse-vacuum-rooms.js";

const logger = Logger.get("VacuumRvcCleanModeServer");

/**
 * Dreame cleaning mode mapping.
 * Dreame uses these mode names: Sweeping, Mopping, Sweeping and mopping, Mopping after sweeping
 */
export enum DreameCleaningMode {
  Sweeping = 0,
  Mopping = 1,
  SweepingAndMopping = 2,
  MoppingAfterSweeping = 3,
}

/**
 * Map Dreame cleaning mode string to our internal mode value
 */
function parseDreameCleaningMode(modeString: string | undefined): number {
  if (!modeString) return DreameCleaningMode.Sweeping;

  const mode = modeString.toLowerCase();
  if (mode.includes("mopping after") || mode.includes("after sweeping")) {
    return DreameCleaningMode.MoppingAfterSweeping;
  }
  if (mode.includes("and") || mode.includes("sweeping and mopping")) {
    return DreameCleaningMode.SweepingAndMopping;
  }
  if (mode === "mopping" || mode.includes("mop")) {
    return DreameCleaningMode.Mopping;
  }
  return DreameCleaningMode.Sweeping;
}

/**
 * Build supported cleaning modes for vacuum.
 * For Dreame vacuums, these are: Sweeping, Mopping, Sweeping and mopping, Mopping after sweeping
 */
function buildSupportedCleanModes(): RvcCleanMode.ModeOption[] {
  return [
    {
      label: "Sweeping",
      mode: DreameCleaningMode.Sweeping,
      modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
    },
    {
      label: "Mopping",
      mode: DreameCleaningMode.Mopping,
      modeTags: [{ value: RvcCleanMode.ModeTag.Mop }],
    },
    {
      label: "Sweeping and mopping",
      mode: DreameCleaningMode.SweepingAndMopping,
      modeTags: [{ value: RvcCleanMode.ModeTag.DeepClean }],
    },
    {
      label: "Mopping after sweeping",
      mode: DreameCleaningMode.MoppingAfterSweeping,
      modeTags: [{ value: RvcCleanMode.ModeTag.VacuumThenMop }],
    },
  ];
}

/**
 * Possible option names for each cleaning mode.
 * Different Dreame vacuum models/integrations use different naming conventions.
 */
const CLEANING_MODE_ALIASES: Record<DreameCleaningMode, string[]> = {
  [DreameCleaningMode.Sweeping]: [
    "Sweeping",
    "Vacuum",
    "Vacuuming",
    "Sweep",
    "vacuum",
    "sweeping",
  ],
  [DreameCleaningMode.Mopping]: ["Mopping", "Mop", "mopping", "mop", "wet_mop"],
  [DreameCleaningMode.SweepingAndMopping]: [
    "Sweeping and mopping",
    "Vacuum and mop",
    "Vacuum & Mop",
    "Vacuum & mop",
    "vacuum_and_mop",
    "sweeping_and_mopping",
  ],
  [DreameCleaningMode.MoppingAfterSweeping]: [
    "Mopping after sweeping",
    "mopping_after_sweeping",
    "Vacuum then mop",
    "Mop after vacuum",
    "vacuum_then_mop",
    "mop_after_vacuum",
  ],
};

/**
 * Find the best matching option from available options for a given mode.
 * Returns the first matching option or the first alias as fallback.
 */
function findMatchingOption(
  mode: DreameCleaningMode,
  availableOptions: string[] | undefined,
): string {
  const aliases = CLEANING_MODE_ALIASES[mode];

  if (!availableOptions || availableOptions.length === 0) {
    return aliases[0]; // Return default alias
  }

  // Try exact match first
  for (const alias of aliases) {
    const match = availableOptions.find(
      (opt) => opt.toLowerCase() === alias.toLowerCase(),
    );
    if (match) return match;
  }

  // Try partial match - only check if option contains alias, not vice versa
  // This prevents "Mopping after sweeping" from matching "Sweeping" because the alias contains the option
  for (const alias of aliases) {
    const match = availableOptions.find((opt) => {
      const optLower = opt.toLowerCase();
      const aliasLower = alias.toLowerCase();
      return optLower.includes(aliasLower);
    });
    if (match) return match;
  }

  // No match found, return first alias
  logger.warn(
    `No matching option found for mode ${DreameCleaningMode[mode]} in [${availableOptions.join(", ")}]`,
  );
  return aliases[0];
}

/**
 * Get the Dreame cleaning mode string from our internal mode value
 * @deprecated Use findMatchingOption with available options instead
 */
function getDreameCleaningModeString(mode: number): string {
  switch (mode) {
    case DreameCleaningMode.Mopping:
      return "Mopping";
    case DreameCleaningMode.SweepingAndMopping:
      return "Sweeping and mopping";
    case DreameCleaningMode.MoppingAfterSweeping:
      return "Mopping after sweeping";
    default:
      return "Sweeping";
  }
}

/**
 * Derive the cleaning mode select entity ID from the vacuum entity ID.
 * Dreame vacuums typically have a select entity like: select.{vacuum_name}_cleaning_mode
 * e.g., vacuum.r2d2 -> select.r2d2_cleaning_mode
 *
 * Note: If the vacuum name contains special characters (e.g., "R2-D2"), the Dreame integration
 * may create entities with underscores (select.r2_d2_cleaning_mode) while the vacuum entity
 * has them removed (vacuum.r2d2). In such cases, users can configure the cleaningModeEntity
 * in the entity mapping settings.
 */
function deriveCleaningModeSelectEntity(vacuumEntityId: string): string {
  // Extract the vacuum name from entity_id (e.g., "vacuum.r2d2" -> "r2d2")
  const vacuumName = vacuumEntityId.replace("vacuum.", "");
  return `select.${vacuumName}_cleaning_mode`;
}

/**
 * Get the cleaning mode select entity ID, using configured value if available.
 */
function getCleaningModeSelectEntity(agent: Agent): string {
  const homeAssistant = agent.get(HomeAssistantEntityBehavior);
  const vacuumEntityId = homeAssistant.entityId;

  // Check if a custom cleaning mode entity is configured in entity mapping
  const mapping = homeAssistant.state.mapping;
  if (mapping?.cleaningModeEntity) {
    logger.debug(
      `Using configured cleaning mode entity: ${mapping.cleaningModeEntity}`,
    );
    return mapping.cleaningModeEntity;
  }

  // Fall back to derived entity
  const derivedEntity = deriveCleaningModeSelectEntity(vacuumEntityId);
  logger.debug(`Using derived cleaning mode entity: ${derivedEntity}`);
  return derivedEntity;
}

const vacuumRvcCleanModeConfig = {
  getCurrentMode: (entity: { attributes: unknown }, agent: Agent): number => {
    // First: try the vacuum entity's own cleaning_mode attribute (reactive via onChange)
    // Some Dreame vacuums expose this directly on the vacuum entity
    const attributes = entity.attributes as VacuumDeviceAttributes & {
      cleaning_mode?: string;
    };
    if (attributes.cleaning_mode) {
      const currentMode = parseDreameCleaningMode(attributes.cleaning_mode);
      logger.debug(
        `Current cleaning mode from vacuum entity: "${attributes.cleaning_mode}" -> ${getDreameCleaningModeString(currentMode)}`,
      );
      return currentMode;
    }

    // Fallback: read from the separate select entity via EntityStateProvider
    // Note: This is NOT reactive — updates only arrive when the vacuum entity itself changes
    const selectEntityId = getCleaningModeSelectEntity(agent);
    const stateProvider = agent.env.get(EntityStateProvider);
    const selectState = stateProvider.getState(selectEntityId);

    const currentOption = selectState?.state as string | undefined;
    const currentMode = parseDreameCleaningMode(currentOption);

    logger.debug(
      `Current cleaning mode from ${selectEntityId}: "${currentOption}" -> ${getDreameCleaningModeString(currentMode)}`,
    );
    return currentMode;
  },

  getSupportedModes: () => buildSupportedCleanModes(),

  setCleanMode: (mode: number, agent: Agent) => {
    const selectEntityId = getCleaningModeSelectEntity(agent);

    // Get available options from the select entity state
    const stateProvider = agent.env.get(EntityStateProvider);
    const selectState = stateProvider.getState(selectEntityId);
    const selectAttributes = selectState?.attributes as
      | { options?: string[] }
      | undefined;
    const availableOptions = selectAttributes?.options;

    if (availableOptions) {
      logger.debug(
        `Available cleaning mode options for ${selectEntityId}: [${availableOptions.join(", ")}]`,
      );
    }

    // Find the best matching option for this mode
    const optionToUse = findMatchingOption(
      mode as DreameCleaningMode,
      availableOptions,
    );

    logger.info(
      `Setting cleaning mode to: ${optionToUse} (mode=${mode}) via ${selectEntityId}`,
    );

    // Dreame vacuums use a separate select entity for cleaning mode
    // Note: If the select entity is unavailable (e.g., vacuum in CleanGenius mode),
    // the action will fail. User should keep vacuum in "Custom" mode.
    return {
      action: "select.select_option",
      data: {
        option: optionToUse,
      },
      target: selectEntityId,
    };
  },
};

/**
 * Create a VacuumRvcCleanModeServer with Dreame cleaning modes.
 */
export function createVacuumRvcCleanModeServer(
  _attributes: VacuumDeviceAttributes,
): ReturnType<typeof RvcCleanModeServer> {
  const supportedModes = buildSupportedCleanModes();

  logger.info(
    `Creating VacuumRvcCleanModeServer with ${supportedModes.length} cleaning modes`,
  );
  logger.info(`Modes: ${supportedModes.map((m) => m.label).join(", ")}`);

  const initialState: RvcCleanModeServerInitialState = {
    supportedModes,
    currentMode: DreameCleaningMode.Sweeping,
  };

  return RvcCleanModeServer(vacuumRvcCleanModeConfig, initialState);
}

/**
 * Check if vacuum supports cleaning modes.
 * Dreame and Ecovacs vacuums typically support vacuum/mop/both modes
 * via a separate select entity (e.g., select.vacuum_cleaning_mode).
 */
export function supportsCleaningModes(
  attributes: VacuumDeviceAttributes,
): boolean {
  return isDreameVacuum(attributes) || isEcovacsVacuum(attributes);
}
