import type {
  CustomServiceArea,
  EntityMappingConfig,
  MatterDeviceType,
} from "./entity-mapping.js";
import type { HomeAssistantDomain } from "./home-assistant-domain.js";

export interface MappingProfileEntry {
  readonly domain: HomeAssistantDomain;
  readonly entityIdPattern?: string;
  readonly matterDeviceType?: MatterDeviceType;
  readonly customName?: string;
  readonly disabled?: boolean;
  readonly filterLifeEntity?: string;
  readonly cleaningModeEntity?: string;
  readonly humidityEntity?: string;
  readonly pressureEntity?: string;
  readonly batteryEntity?: string;
  readonly roomEntities?: string[];
  readonly disableLockPin?: boolean;
  readonly powerEntity?: string;
  readonly energyEntity?: string;
  readonly suctionLevelEntity?: string;
  readonly mopIntensityEntity?: string;
  readonly customServiceAreas?: CustomServiceArea[];
  readonly customFanSpeedTags?: Record<string, number>;
  readonly valetudoIdentifier?: string;
  readonly coverSwapOpenClose?: boolean;
}

export interface MappingProfile {
  readonly version: 1;
  readonly name: string;
  readonly description?: string;
  readonly author?: string;
  readonly createdAt: string;
  readonly domains: HomeAssistantDomain[];
  readonly entryCount: number;
  readonly entries: MappingProfileEntry[];
}

export interface MappingProfileImportMatch {
  readonly entry: MappingProfileEntry;
  readonly matchedEntityId: string;
  readonly matchType: "exact" | "domain";
  readonly existingMapping?: EntityMappingConfig;
}

export interface MappingProfileImportPreview {
  readonly profileName: string;
  readonly totalEntries: number;
  readonly matches: MappingProfileImportMatch[];
  readonly unmatchedEntries: MappingProfileEntry[];
}

export interface MappingProfileImportRequest {
  readonly bridgeId: string;
  readonly profile: MappingProfile;
  readonly selectedEntityIds: string[];
}

export interface MappingProfileImportResult {
  readonly applied: number;
  readonly skipped: number;
  readonly errors: Array<{ entityId: string; error: string }>;
}
