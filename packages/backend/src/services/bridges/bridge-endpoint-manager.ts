import type {
  EntityMappingConfig,
  FailedEntity,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import { Endpoint } from "@matter/main";
import { Service } from "../../core/ioc/service.js";
import { AggregatorEndpoint } from "../../matter/endpoints/aggregator-endpoint.js";
import type { EntityEndpoint } from "../../matter/endpoints/entity-endpoint.js";
import { LegacyEndpoint } from "../../matter/endpoints/legacy/legacy-endpoint.js";
import { createPluginEndpointType } from "../../plugins/plugin-device-factory.js";
import type { PluginInstaller } from "../../plugins/plugin-installer.js";
import type { PluginManager } from "../../plugins/plugin-manager.js";
import type { PluginRegistry } from "../../plugins/plugin-registry.js";
import type { PluginDevice, PluginMetadata } from "../../plugins/types.js";
import { isHeapUnderPressure } from "../../utils/log-memory.js";
import { subscribeEntities } from "../home-assistant/api/subscribe-entities.js";
import type { HomeAssistantClient } from "../home-assistant/home-assistant-client.js";
import type { HomeAssistantStates } from "../home-assistant/home-assistant-registry.js";
import type { EntityMappingStorage } from "../storage/entity-mapping-storage.js";
import type { BridgeRegistry } from "./bridge-registry.js";
import { EntityIsolationService } from "./entity-isolation-service.js";

const MAX_ENTITY_ID_LENGTH = 150;

export class BridgeEndpointManager extends Service {
  readonly root: Endpoint;
  private entityIds: string[] = [];
  private unsubscribe?: () => void;
  private _failedEntities: FailedEntity[] = [];
  private readonly mappingFingerprints = new Map<string, string>();
  private readonly pluginEndpoints = new Map<string, Endpoint>();
  private readonly pluginStateUpdating = new Set<string>();

  get failedEntities(): FailedEntity[] {
    // Combine static failed entities with dynamically isolated entities
    const isolated = EntityIsolationService.getIsolatedEntities(this.bridgeId);
    return [...this._failedEntities, ...isolated];
  }

  constructor(
    private readonly client: HomeAssistantClient,
    private readonly registry: BridgeRegistry,
    private readonly mappingStorage: EntityMappingStorage,
    private readonly bridgeId: string,
    private readonly log: Logger,
    private readonly pluginManager?: PluginManager,
    private readonly pluginRegistry?: PluginRegistry,
    private readonly pluginInstaller?: PluginInstaller,
  ) {
    super("BridgeEndpointManager");
    this.root = new AggregatorEndpoint("aggregator");

    // Register callback to isolate problematic entities at runtime
    EntityIsolationService.registerIsolationCallback(
      bridgeId,
      this.isolateEntity.bind(this),
    );

    if (this.pluginManager) {
      this.wirePluginCallbacks();
    }
  }

  private wirePluginCallbacks(): void {
    if (!this.pluginManager) return;

    this.pluginManager.onDeviceRegistered = async (
      pluginName: string,
      device: PluginDevice,
    ) => {
      const type = createPluginEndpointType(device.deviceType);
      if (!type) {
        this.log.warn(
          `Plugin "${pluginName}": unsupported device type "${device.deviceType}" for device "${device.id}"`,
        );
        return;
      }
      // Set PluginDeviceBehavior state and apply initial cluster config
      const initialState: Record<string, object> = {
        pluginDevice: { device, pluginName },
      };
      for (const cluster of device.clusters) {
        initialState[cluster.clusterId] = cluster.attributes;
      }
      // biome-ignore lint/suspicious/noExplicitAny: EndpointType lacks .set() in its type but all factory results are MutableEndpoints
      const configuredType = (type as any).set(initialState) as typeof type;
      const endpoint = new Endpoint(configuredType, {
        id: `plugin_${device.id}`,
      });
      try {
        await this.root.add(endpoint);
        this.pluginEndpoints.set(device.id, endpoint);
        this.wirePluginEndpointEvents(device, endpoint);
        this.log.info(
          `Plugin "${pluginName}": added device "${device.name}" (${device.deviceType})`,
        );
      } catch (e) {
        this.log.warn(
          `Plugin "${pluginName}": failed to add device "${device.id}":`,
          e,
        );
      }
    };

    this.pluginManager.onDeviceUnregistered = async (
      pluginName: string,
      deviceId: string,
    ) => {
      const endpoint = this.pluginEndpoints.get(deviceId);
      if (endpoint) {
        try {
          await endpoint.delete();
        } catch (e) {
          this.log.warn(
            `Plugin "${pluginName}": failed to remove device "${deviceId}":`,
            e,
          );
        }
        this.pluginEndpoints.delete(deviceId);
      }
    };

    this.pluginManager.onDeviceStateUpdated = (
      pluginName: string,
      deviceId: string,
      clusterId: string,
      attributes: Record<string, unknown>,
    ) => {
      const endpoint = this.pluginEndpoints.get(deviceId);
      if (!endpoint) return;
      const behaviorType = endpoint.type.behaviors[clusterId];
      if (!behaviorType) {
        this.log.debug(
          `Plugin "${pluginName}": cluster "${clusterId}" not found on device "${deviceId}"`,
        );
        return;
      }
      this.pluginStateUpdating.add(deviceId);
      endpoint
        .setStateOf(behaviorType, attributes)
        .catch((e) => {
          this.log.warn(
            `Plugin "${pluginName}": failed to update "${clusterId}" on "${deviceId}":`,
            e,
          );
        })
        .finally(() => {
          this.pluginStateUpdating.delete(deviceId);
        });
    };
  }

  private wirePluginEndpointEvents(
    device: PluginDevice,
    endpoint: Endpoint,
  ): void {
    if (!device.onAttributeWrite) return;
    // biome-ignore lint/suspicious/noExplicitAny: matter.js events are dynamically typed per endpoint
    const allEvents = endpoint.events as any;
    for (const behaviorId of Object.keys(endpoint.type.behaviors)) {
      if (behaviorId === "pluginDevice") continue;
      const behaviorEvents = allEvents[behaviorId];
      if (!behaviorEvents || typeof behaviorEvents !== "object") continue;
      for (const eventName of Object.keys(behaviorEvents)) {
        if (!eventName.endsWith("$Changed")) continue;
        const observable = behaviorEvents[eventName];
        if (!observable || typeof observable.on !== "function") continue;
        const attrName = eventName.slice(0, -"$Changed".length);
        observable.on((newValue: unknown) => {
          if (this.pluginStateUpdating.has(device.id)) return;
          device
            .onAttributeWrite?.(behaviorId, attrName, newValue)
            .catch((e: unknown) => {
              this.log.debug(
                `Plugin device "${device.id}": onAttributeWrite error for ${behaviorId}.${attrName}:`,
                e,
              );
            });
        });
      }
    }
  }

  async startPlugins(): Promise<void> {
    if (!this.pluginManager) return;
    await this.loadRegisteredPlugins();
    await this.pluginManager.startAll();
    await this.pluginManager.configureAll();
  }

  private async loadRegisteredPlugins(): Promise<void> {
    if (!this.pluginManager || !this.pluginRegistry || !this.pluginInstaller)
      return;
    const registered = this.pluginRegistry.getAll();
    for (const entry of registered) {
      if (!entry.autoLoad) continue;
      const packagePath = this.pluginInstaller.getPluginPath(entry.packageName);
      try {
        await this.pluginManager.loadExternal(packagePath, entry.config);
        this.log.info(
          `Loaded external plugin: ${entry.packageName} from ${packagePath}`,
        );
      } catch (e) {
        this.log.warn(
          `Failed to load external plugin "${entry.packageName}":`,
          e,
        );
      }
    }
  }

  async stopPlugins(): Promise<void> {
    if (!this.pluginManager) return;
    await this.pluginManager.shutdownAll("Bridge stopping");
    for (const [id, endpoint] of this.pluginEndpoints) {
      try {
        await endpoint.delete();
      } catch (e) {
        this.log.warn(`Failed to delete plugin endpoint ${id}:`, e);
      }
    }
    this.pluginEndpoints.clear();
  }

  getPluginInfo(): {
    metadata: PluginMetadata[];
    devices: Array<{ pluginName: string; device: PluginDevice }>;
    circuitBreakers: Record<
      string,
      {
        failures: number;
        disabled: boolean;
        lastError?: string;
        disabledAt?: number;
      }
    >;
  } {
    if (!this.pluginManager) {
      return { metadata: [], devices: [], circuitBreakers: {} };
    }
    const cbStates = this.pluginManager.getCircuitBreakerStates();
    const circuitBreakers: Record<
      string,
      {
        failures: number;
        disabled: boolean;
        lastError?: string;
        disabledAt?: number;
      }
    > = {};
    for (const [name, state] of cbStates) {
      circuitBreakers[name] = state;
    }
    return {
      metadata: this.pluginManager.getMetadata(),
      devices: this.pluginManager.getAllDevices(),
      circuitBreakers,
    };
  }

  enablePlugin(pluginName: string): void {
    this.pluginManager?.enablePlugin(pluginName);
  }

  disablePlugin(pluginName: string): void {
    this.pluginManager?.disablePlugin(pluginName);
  }

  resetPlugin(pluginName: string): void {
    this.pluginManager?.resetPlugin(pluginName);
  }

  getPluginConfigSchema(
    pluginName: string,
  ): Record<string, unknown> | undefined {
    // biome-ignore lint/suspicious/noExplicitAny: PluginConfigSchema is structurally compatible
    return this.pluginManager?.getConfigSchema(pluginName) as any;
  }

  async updatePluginConfig(
    pluginName: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    return (
      (await this.pluginManager?.updateConfig(pluginName, config)) ?? false
    );
  }

  /**
   * Isolate an entity by removing it from the aggregator.
   * Called by EntityIsolationService when a runtime error is detected.
   */
  async isolateEntity(entityName: string): Promise<void> {
    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    const endpoint = endpoints.find(
      (e) => e.id === entityName || e.entityId === entityName,
    );

    if (endpoint) {
      this.log.warn(
        `Isolating entity ${endpoint.entityId} due to runtime error`,
      );
      try {
        await endpoint.delete();
      } catch (e) {
        this.log.error(`Failed to delete isolated endpoint:`, e);
      }
    }
  }

  private getEntityMapping(entityId: string): EntityMappingConfig | undefined {
    return this.mappingStorage.getMapping(this.bridgeId, entityId);
  }

  private computeMappingFingerprint(
    mapping: EntityMappingConfig | undefined,
  ): string {
    if (!mapping) return "";
    return JSON.stringify(mapping);
  }

  override async dispose(): Promise<void> {
    this.stopObserving();
    EntityIsolationService.unregisterIsolationCallback(this.bridgeId);
    EntityIsolationService.clearIsolatedEntities(this.bridgeId);

    // Close all endpoints to free memory while preserving stored endpoint
    // numbers. Using delete() here would erase the persisted endpoint numbers
    // from matter.js storage, causing controllers to treat devices as new on
    // the next restart (losing names, rooms, icons, and automations).
    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    for (const endpoint of endpoints) {
      try {
        await endpoint.close();
      } catch (e) {
        this.log.warn(`Failed to close endpoint during dispose:`, e);
      }
    }
  }

  async startObserving() {
    this.stopObserving();

    if (!this.entityIds.length) {
      return;
    }

    const subscriptionIds = this.collectSubscriptionEntityIds();
    this.unsubscribe = subscribeEntities(
      this.client.connection,
      (e) => this.updateStates(e),
      subscriptionIds,
    );
  }

  private collectSubscriptionEntityIds(): string[] {
    const ids = new Set(this.entityIds);
    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    for (const endpoint of endpoints) {
      const mappedIds = endpoint.mappedEntityIds;
      if (mappedIds) {
        for (const mappedId of mappedIds) {
          ids.add(mappedId);
        }
      }
    }
    return [...ids];
  }

  stopObserving() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async refreshDevices() {
    this.registry.refresh();
    this._failedEntities = [];

    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    this.entityIds = this.registry.entityIds;

    // Pre-calculate composed air purifier sub-entities so they get skipped
    // during individual endpoint creation (requires mapping access).
    if (this.registry.isAutoComposedDevicesEnabled()) {
      for (const eid of this.entityIds) {
        if (!eid.startsWith("fan.")) continue;
        const m = this.getEntityMapping(eid);
        const matterType = m?.matterDeviceType ?? "fan";
        if (matterType !== "air_purifier") continue;
        const ent = this.registry.entity(eid);
        if (!ent?.device_id) continue;
        const tempId = this.registry.findTemperatureEntityForDevice(
          ent.device_id,
        );
        const humId = this.registry.findHumidityEntityForDevice(ent.device_id);
        if (tempId) this.registry.markComposedSubEntityUsed(tempId);
        if (humId) this.registry.markComposedSubEntityUsed(humId);
      }
    }

    const existingEndpoints: EntityEndpoint[] = [];
    for (const endpoint of endpoints) {
      if (!this.entityIds.includes(endpoint.entityId)) {
        try {
          await endpoint.delete();
        } catch (e) {
          this.log.warn(`Failed to delete endpoint ${endpoint.entityId}:`, e);
        }
        this.mappingFingerprints.delete(endpoint.entityId);
      } else if (
        this.registry.isAutoComposedDevicesEnabled() &&
        this.registry.isComposedSubEntityUsed(endpoint.entityId)
      ) {
        // Entity was consumed by a composed device (e.g., temp/hum sensor
        // absorbed into an air purifier). Delete the standalone endpoint so
        // the composed device is the only representation (#218).
        this.log.info(
          `Deleting standalone endpoint ${endpoint.entityId} — consumed by composed device`,
        );
        try {
          await endpoint.delete();
        } catch (e) {
          this.log.warn(
            `Failed to delete composed sub-entity endpoint ${endpoint.entityId}:`,
            e,
          );
        }
        this.mappingFingerprints.delete(endpoint.entityId);
      } else {
        // Check if the mapping changed since the endpoint was created.
        // If so, delete the old endpoint so it gets recreated with the new config.
        const currentMapping = this.getEntityMapping(endpoint.entityId);
        const currentFp = this.computeMappingFingerprint(currentMapping);
        const storedFp = this.mappingFingerprints.get(endpoint.entityId) ?? "";
        if (currentFp !== storedFp) {
          this.log.info(
            `Mapping changed for ${endpoint.entityId}, recreating endpoint`,
          );
          try {
            await endpoint.delete();
          } catch (e) {
            this.log.warn(
              `Failed to delete endpoint ${endpoint.entityId} for mapping change:`,
              e,
            );
          }
          this.mappingFingerprints.delete(endpoint.entityId);
        } else {
          existingEndpoints.push(endpoint);
        }
      }
    }

    let memoryLimitReached = false;

    for (const entityId of this.entityIds) {
      // Check heap pressure before creating a new endpoint.
      // matter.js endpoints are memory-heavy (~1-3 MB each), so we stop
      // loading more entities when the heap approaches its limit to
      // prevent OOM crashes. Already-loaded endpoints keep working.
      if (!memoryLimitReached && isHeapUnderPressure()) {
        memoryLimitReached = true;
        this.log.error(
          "Memory pressure detected — skipping remaining entities to prevent OOM crash. " +
            "Reduce the number of entities in this bridge or increase the Node.js heap size (NODE_OPTIONS=--max-old-space-size=1024).",
        );
      }
      if (memoryLimitReached) {
        // Skip existing endpoints that are already loaded
        if (!existingEndpoints.some((e) => e.entityId === entityId)) {
          this._failedEntities.push({
            entityId,
            reason:
              "Skipped due to memory pressure — reduce entities or increase heap size",
          });
        }
        continue;
      }

      const mapping = this.getEntityMapping(entityId);

      if (mapping?.disabled) {
        this.log.debug(`Skipping disabled entity: ${entityId}`);
        continue;
      }

      if (entityId.length > MAX_ENTITY_ID_LENGTH) {
        const reason = `Entity ID too long (${entityId.length} chars, max ${MAX_ENTITY_ID_LENGTH}). This would cause filesystem errors.`;
        this.log.warn(`Skipping entity: ${entityId}. Reason: ${reason}`);
        this._failedEntities.push({ entityId, reason });
        continue;
      }

      let endpoint = existingEndpoints.find((e) => e.entityId === entityId);
      if (!endpoint) {
        try {
          endpoint = await LegacyEndpoint.create(
            this.registry,
            entityId,
            mapping,
          );
        } catch (e) {
          // Handle all endpoint creation errors gracefully to prevent boot crashes
          const reason = this.extractErrorReason(e);
          this.log.warn(`Failed to create device ${entityId}: ${reason}`);
          this._failedEntities.push({ entityId, reason });
          continue;
        }

        if (endpoint) {
          try {
            await this.root.add(endpoint);
            this.mappingFingerprints.set(
              entityId,
              this.computeMappingFingerprint(mapping),
            );
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            // Handle all endpoint initialization errors gracefully
            this.log.warn(
              `Failed to add endpoint for ${entityId}: ${errorMessage}`,
            );
            // Extract detailed behavior error info for debugging
            this.logDetailedError(entityId, e);
            this._failedEntities.push({
              entityId,
              reason: this.extractErrorReason(e),
            });
          }
        }
      }
    }

    if (this.unsubscribe) {
      this.startObserving();
    }
  }

  async updateStates(states: HomeAssistantStates) {
    // Merge subscription states into registry so EntityStateProvider
    // reads fresh values for mapped entities (battery, humidity, etc.)
    this.registry.mergeExternalStates(states);

    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    // Process state updates in parallel for faster response times
    // Use allSettled so one failing endpoint doesn't block all others
    const results = await Promise.allSettled(
      endpoints.map((endpoint) => endpoint.updateStates(states)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.log.warn("State update failed for endpoint:", result.reason);
      }
    }
  }

  /**
   * Log detailed behavior error information for debugging "Behaviors have errors".
   * Matter.js EndpointBehaviorsError extends AggregateError — the `errors` array
   * contains individual behavior crash errors (one per failed behavior).
   */
  private logDetailedError(entityId: string, error: unknown): void {
    if (!(error instanceof Error)) return;

    // Matter.js EndpointBehaviorsError extends AggregateError
    // The `errors` array contains the actual per-behavior errors
    const errorsArray = (error as Error & { errors?: unknown[] }).errors;
    if (Array.isArray(errorsArray) && errorsArray.length > 0) {
      for (let i = 0; i < errorsArray.length; i++) {
        const subError = errorsArray[i];
        const subMsg =
          subError instanceof Error ? subError.message : String(subError);
        this.log.warn(
          `[${entityId}] Behavior error [${i + 1}/${errorsArray.length}]: ${subMsg}`,
        );

        // Walk the cause chain for each sub-error
        let cause: unknown =
          subError instanceof Error
            ? (subError as Error & { cause?: unknown }).cause
            : undefined;
        while (cause instanceof Error) {
          this.log.warn(`[${entityId}]   Caused by: ${cause.message}`);
          cause = (cause as Error & { cause?: unknown }).cause;
        }

        // Log sub-error stack at debug level
        if (subError instanceof Error && subError.stack) {
          this.log.debug(`[${entityId}] Sub-error stack: ${subError.stack}`);
        }
      }
    } else {
      // Fallback: walk the cause chain of the main error
      let current: unknown = (error as Error & { cause?: unknown }).cause;
      while (current instanceof Error) {
        this.log.warn(`[${entityId}] Caused by: ${current.message}`);
        current = (current as Error & { cause?: unknown }).cause;
      }
    }

    // Always log the main error stack at debug level
    if (error.stack) {
      this.log.debug(`[${entityId}] Full stack: ${error.stack}`);
    }
  }

  private extractErrorReason(error: unknown): string {
    if (error instanceof Error) {
      // Check for nested cause (common in Matter.js errors)
      const cause = (error as Error & { cause?: Error }).cause;
      if (cause?.message) {
        return `${error.message}: ${cause.message}`;
      }
      return error.message;
    }
    return String(error);
  }
}
