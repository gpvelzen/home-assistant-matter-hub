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
 * Suction intensity levels mapped to ModeBase standard tags.
 * Standard (0) has no extra tag; Quiet and Max add modifier tags that
 * Apple Home shows in the "extra features" panel.
 */
enum SuctionIntensity {
  Standard = 0,
  Quiet = 1,
  Max = 2,
}

const SUCTION_MULTIPLIER = 10;

function encodeMode(
  cleanMode: DreameCleaningMode,
  suction: SuctionIntensity,
): number {
  return cleanMode * SUCTION_MULTIPLIER + suction;
}

function decodeMode(mode: number): {
  cleanMode: DreameCleaningMode;
  suction: SuctionIntensity;
} {
  return {
    cleanMode: Math.floor(mode / SUCTION_MULTIPLIER) as DreameCleaningMode,
    suction: (mode % SUCTION_MULTIPLIER) as SuctionIntensity,
  };
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
 * Base mode tag sets for each cleaning type.
 */
const CLEAN_MODE_TAGS: Record<
  DreameCleaningMode,
  RvcCleanMode.ModeTagStruct[]
> = {
  [DreameCleaningMode.Sweeping]: [{ value: RvcCleanMode.ModeTag.Vacuum }],
  [DreameCleaningMode.Mopping]: [{ value: RvcCleanMode.ModeTag.Mop }],
  [DreameCleaningMode.SweepingAndMopping]: [
    { value: RvcCleanMode.ModeTag.Vacuum },
    { value: RvcCleanMode.ModeTag.Mop },
  ],
  [DreameCleaningMode.MoppingAfterSweeping]: [
    { value: RvcCleanMode.ModeTag.DeepClean },
    { value: RvcCleanMode.ModeTag.Vacuum },
    { value: RvcCleanMode.ModeTag.Mop },
  ],
};

const CLEAN_MODE_LABELS: Record<DreameCleaningMode, string> = {
  [DreameCleaningMode.Sweeping]: "Sweeping",
  [DreameCleaningMode.Mopping]: "Mopping",
  [DreameCleaningMode.SweepingAndMopping]: "Sweeping and mopping",
  [DreameCleaningMode.MoppingAfterSweeping]: "Mopping after sweeping",
};

/**
 * Build supported cleaning modes without suction variants (4 modes).
 */
function buildSupportedCleanModes(): RvcCleanMode.ModeOption[] {
  const cleanTypes = [
    DreameCleaningMode.Sweeping,
    DreameCleaningMode.Mopping,
    DreameCleaningMode.SweepingAndMopping,
    DreameCleaningMode.MoppingAfterSweeping,
  ];
  return cleanTypes.map((ct) => ({
    label: CLEAN_MODE_LABELS[ct],
    mode: ct,
    modeTags: [...CLEAN_MODE_TAGS[ct]],
  }));
}

/**
 * Build supported cleaning modes WITH suction intensity variants (12 modes).
 * Each cleaning type gets Standard/Quiet/Max variants.
 * Apple Home shows Quiet and Max as toggles in the "extra features" panel.
 */
function buildSupportedCleanModesWithSuction(): RvcCleanMode.ModeOption[] {
  const cleanTypes = [
    DreameCleaningMode.Sweeping,
    DreameCleaningMode.Mopping,
    DreameCleaningMode.SweepingAndMopping,
    DreameCleaningMode.MoppingAfterSweeping,
  ];

  const modes: RvcCleanMode.ModeOption[] = [];

  for (const ct of cleanTypes) {
    const baseTags = CLEAN_MODE_TAGS[ct];
    const baseLabel = CLEAN_MODE_LABELS[ct];

    // Standard — no extra tag
    modes.push({
      label: baseLabel,
      mode: encodeMode(ct, SuctionIntensity.Standard),
      modeTags: [...baseTags],
    });

    // Quiet — adds Quiet modifier tag
    modes.push({
      label: `${baseLabel} (Quiet)`,
      mode: encodeMode(ct, SuctionIntensity.Quiet),
      modeTags: [...baseTags, { value: RvcCleanMode.ModeTag.Quiet }],
    });

    // Max — adds Max modifier tag
    modes.push({
      label: `${baseLabel} (Max)`,
      mode: encodeMode(ct, SuctionIntensity.Max),
      modeTags: [...baseTags, { value: RvcCleanMode.ModeTag.Max }],
    });
  }

  return modes;
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
 * Aliases for suction level options, ordered low → high.
 */
const SUCTION_QUIET_ALIASES = [
  "quiet",
  "silent",
  "low",
  "eco",
  "gentle",
];

const SUCTION_MAX_ALIASES = [
  "turbo",
  "max",
  "strong",
  "boost",
  "power",
  "high",
  "full",
];

/**
 * Find the suction option string that best matches the requested intensity.
 */
function findSuctionOption(
  intensity: SuctionIntensity,
  availableOptions: string[] | undefined,
): string | undefined {
  if (!availableOptions || availableOptions.length === 0) return undefined;

  const aliases =
    intensity === SuctionIntensity.Quiet
      ? SUCTION_QUIET_ALIASES
      : SUCTION_MAX_ALIASES;

  for (const alias of aliases) {
    const match = availableOptions.find(
      (opt) => opt.toLowerCase() === alias.toLowerCase(),
    );
    if (match) return match;
  }

  for (const alias of aliases) {
    const match = availableOptions.find((opt) =>
      opt.toLowerCase().includes(alias),
    );
    if (match) return match;
  }

  // Fallback: first option for quiet, last option for max
  if (intensity === SuctionIntensity.Quiet) return availableOptions[0];
  return availableOptions[availableOptions.length - 1];
}

/**
 * Determine current suction intensity from the suction level entity state.
 */
function parseSuctionIntensity(
  suctionState: string | undefined,
): SuctionIntensity {
  if (!suctionState) return SuctionIntensity.Standard;

  const lower = suctionState.toLowerCase();

  for (const alias of SUCTION_QUIET_ALIASES) {
    if (lower === alias || lower.includes(alias)) {
      return SuctionIntensity.Quiet;
    }
  }

  for (const alias of SUCTION_MAX_ALIASES) {
    if (lower === alias || lower.includes(alias)) {
      return SuctionIntensity.Max;
    }
  }

  return SuctionIntensity.Standard;
}

/**
 * Get the Dreame cleaning mode string from our internal mode value
 * @deprecated Use findMatchingOption with available options instead
 */
function getDreameCleaningModeString(mode: number): string {
  return CLEAN_MODE_LABELS[mode as DreameCleaningMode] ?? "Sweeping";
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

/**
 * Read a select entity's current state and options.
 */
function readSelectEntity(
  entityId: string,
  agent: Agent,
): { state?: string; options?: string[] } {
  const stateProvider = agent.env.get(EntityStateProvider);
  const entityState = stateProvider.getState(entityId);
  if (!entityState) return {};
  const attrs = entityState.attributes as { options?: string[] } | undefined;
  return {
    state: entityState.state as string | undefined,
    options: attrs?.options,
  };
}

function createCleanModeConfig(hasSuction: boolean) {
  return {
    getCurrentMode: (
      entity: { attributes: unknown },
      agent: Agent,
    ): number => {
      // Determine current cleaning type
      const attributes = entity.attributes as VacuumDeviceAttributes & {
        cleaning_mode?: string;
      };
      let cleanMode: DreameCleaningMode;

      if (attributes.cleaning_mode) {
        cleanMode = parseDreameCleaningMode(
          attributes.cleaning_mode,
        ) as DreameCleaningMode;
        logger.debug(
          `Current cleaning mode from vacuum entity: "${attributes.cleaning_mode}" -> ${getDreameCleaningModeString(cleanMode)}`,
        );
      } else {
        const selectEntityId = getCleaningModeSelectEntity(agent);
        const { state } = readSelectEntity(selectEntityId, agent);
        cleanMode = parseDreameCleaningMode(state) as DreameCleaningMode;
        logger.debug(
          `Current cleaning mode from ${selectEntityId}: "${state}" -> ${getDreameCleaningModeString(cleanMode)}`,
        );
      }

      if (!hasSuction) return cleanMode;

      // Determine current suction intensity
      const mapping = agent.get(HomeAssistantEntityBehavior).state.mapping;
      const suctionEntityId = mapping?.suctionLevelEntity;
      if (!suctionEntityId)
        return encodeMode(cleanMode, SuctionIntensity.Standard);

      const { state: suctionState } = readSelectEntity(suctionEntityId, agent);
      const suction = parseSuctionIntensity(suctionState);
      const encoded = encodeMode(cleanMode, suction);
      logger.debug(
        `Current suction from ${suctionEntityId}: "${suctionState}" -> intensity=${SuctionIntensity[suction]}, encoded=${encoded}`,
      );
      return encoded;
    },

    getSupportedModes: () =>
      hasSuction
        ? buildSupportedCleanModesWithSuction()
        : buildSupportedCleanModes(),

    setCleanMode: (mode: number, agent: Agent) => {
      const selectEntityId = getCleaningModeSelectEntity(agent);
      const { options: availableOptions } = readSelectEntity(
        selectEntityId,
        agent,
      );

      if (availableOptions) {
        logger.debug(
          `Available cleaning mode options for ${selectEntityId}: [${availableOptions.join(", ")}]`,
        );
      }

      const cleanMode = hasSuction
        ? decodeMode(mode).cleanMode
        : (mode as DreameCleaningMode);
      const suction = hasSuction
        ? decodeMode(mode).suction
        : SuctionIntensity.Standard;

      const optionToUse = findMatchingOption(cleanMode, availableOptions);

      logger.info(
        `Setting cleaning mode to: ${optionToUse} (mode=${mode}, clean=${getDreameCleaningModeString(cleanMode)}, suction=${SuctionIntensity[suction]}) via ${selectEntityId}`,
      );

      // If suction entity is configured and intensity changed, set it too
      if (hasSuction && suction !== SuctionIntensity.Standard) {
        const mapping = agent.get(HomeAssistantEntityBehavior).state.mapping;
        const suctionEntityId = mapping?.suctionLevelEntity;
        if (suctionEntityId) {
          const { options: suctionOptions } = readSelectEntity(
            suctionEntityId,
            agent,
          );
          const suctionOption = findSuctionOption(suction, suctionOptions);
          if (suctionOption) {
            logger.info(
              `Setting suction level to: ${suctionOption} via ${suctionEntityId}`,
            );
            const homeAssistant = agent.get(HomeAssistantEntityBehavior);
            homeAssistant.callAction({
              action: "select.select_option",
              data: { option: suctionOption },
              target: suctionEntityId,
            });
          }
        }
      }

      return {
        action: "select.select_option",
        data: { option: optionToUse },
        target: selectEntityId,
      };
    },
  };
}

/**
 * Create a VacuumRvcCleanModeServer with Dreame cleaning modes.
 * When hasSuction is true, each cleaning type gets Quiet/Max intensity
 * variants that enable Apple Home's "extra features" panel.
 */
export function createVacuumRvcCleanModeServer(
  _attributes: VacuumDeviceAttributes,
  hasSuction = false,
): ReturnType<typeof RvcCleanModeServer> {
  const supportedModes = hasSuction
    ? buildSupportedCleanModesWithSuction()
    : buildSupportedCleanModes();

  logger.info(
    `Creating VacuumRvcCleanModeServer with ${supportedModes.length} cleaning modes (suction=${hasSuction})`,
  );
  logger.info(
    `Modes: ${supportedModes.map((m) => `${m.mode}:${m.label}`).join(", ")}`,
  );

  const initialState: RvcCleanModeServerInitialState = {
    supportedModes,
    currentMode: hasSuction
      ? encodeMode(DreameCleaningMode.Sweeping, SuctionIntensity.Standard)
      : DreameCleaningMode.Sweeping,
  };

  return RvcCleanModeServer(createCleanModeConfig(hasSuction), initialState);
}

/**
 * Create a default RvcCleanMode server with a single "Vacuum" mode.
 * Used for vacuums that don't support multiple cleaning modes
 * (e.g. Roborock via Xiaomi integration, iRobot Roomba, etc.).
 *
 * Alexa probes for RvcCleanMode (0x55) during device discovery.
 * Without it, Alexa may fail to complete CASE session establishment
 * and never subscribe, leaving the vacuum undiscoverable.
 */
export function createDefaultRvcCleanModeServer(): ReturnType<
  typeof RvcCleanModeServer
> {
  const defaultConfig = {
    getCurrentMode: () => 0,
    getSupportedModes: (): RvcCleanMode.ModeOption[] => [
      {
        label: "Vacuum",
        mode: 0,
        modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
      },
    ],
    setCleanMode: () => undefined,
  };

  return RvcCleanModeServer(defaultConfig);
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
