import type {
  BridgeData,
  BridgeFeatureFlags,
  EntityMappingConfig,
  HomeAssistantDeviceRegistry,
} from "@home-assistant-matter-hub/common";
import type { Environment } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";
import { type Endpoint, ServerNode } from "@matter/main/node";
import { DeviceTypeId, VendorId } from "@matter/main/types";
import { applyPatchState } from "../../utils/apply-patch-state.js";
import { trimToLength } from "../../utils/trim-to-length.js";

/**
 * ServerModeServerNode exposes a single device directly as the root endpoint.
 * This is different from BridgeServerNode which uses an AggregatorEndpoint.
 *
 * Server Mode is required for Apple Home to properly support Siri voice commands
 * for certain device types like Robot Vacuums (RVC).
 *
 * In server mode, the device endpoint becomes a child of the root node,
 * but without the Aggregator wrapper - making it appear as a standalone device.
 */
export class ServerModeServerNode extends ServerNode {
  private deviceEndpoint?: Endpoint;
  private readonly featureFlags?: BridgeFeatureFlags;

  constructor(env: Environment, bridgeData: BridgeData) {
    super({
      id: bridgeData.id,
      environment: env,
      network: {
        port: bridgeData.port,
      },
      productDescription: {
        name: bridgeData.name,
        deviceType: DeviceTypeId(RoboticVacuumCleanerDevice.deviceType),
      },
      basicInformation: {
        uniqueId: bridgeData.id,
        nodeLabel: trimToLength(bridgeData.name, 32, "..."),
        vendorId: VendorId(bridgeData.basicInformation.vendorId),
        vendorName: bridgeData.basicInformation.vendorName,
        productId: bridgeData.basicInformation.productId,
        productName: bridgeData.basicInformation.productName,
        productLabel: bridgeData.basicInformation.productLabel,
        serialNumber: `server-${bridgeData.id}`.substring(0, 32),
        hardwareVersion: bridgeData.basicInformation.hardwareVersion,
        softwareVersion: bridgeData.basicInformation.softwareVersion,
        ...(bridgeData.countryCode ? { location: bridgeData.countryCode } : {}),
      },
      subscriptions: {
        persistenceEnabled: false,
      },
    });
    this.featureFlags = bridgeData.featureFlags;
  }

  /**
   * Add the device endpoint to this server node.
   * In server mode, only ONE device is allowed.
   * This method is idempotent - if a device already exists, it's a no-op.
   */
  async addDevice(endpoint: Endpoint): Promise<void> {
    if (this.deviceEndpoint) {
      // Already have a device - this is fine, just ignore
      return;
    }
    this.deviceEndpoint = endpoint;
    await this.add(endpoint);
  }

  /**
   * Clear the device reference after the endpoint has been deleted externally.
   * Must be called before addDevice() when replacing the device endpoint.
   */
  clearDevice(): void {
    this.deviceEndpoint = undefined;
  }

  /**
   * Update root-level BasicInformation with entity-specific data.
   * In server mode, controllers (Apple Home, Alexa) read the root node's
   * BasicInformation — not the device endpoint's BridgedDeviceBasicInformation.
   * Without this, server-mode devices show bridge defaults (e.g. "riddix" / "MatterHub").
   */
  updateDeviceIdentity(
    entityId: string,
    device: HomeAssistantDeviceRegistry | undefined,
    mapping: EntityMappingConfig | undefined,
    friendlyName: string | undefined,
  ): void {
    const nodeLabel =
      trimToLength(mapping?.customName, 32, "...") ??
      trimToLength(friendlyName, 32, "...") ??
      trimToLength(entityId, 32, "...");
    const productNameFromNodeLabel =
      this.featureFlags?.productNameFromNodeLabel === true
        ? nodeLabel
        : undefined;
    applyPatchState(this.state.basicInformation, {
      vendorName:
        trimToLength(mapping?.customVendorName, 32, "...") ??
        trimToLength(device?.manufacturer, 32, "..."),
      productName:
        trimToLength(mapping?.customProductName, 32, "...") ??
        productNameFromNodeLabel ??
        trimToLength(device?.model_id, 32, "...") ??
        trimToLength(device?.model, 32, "..."),
      productLabel: trimToLength(device?.model, 64, "..."),
      nodeLabel,
      serialNumber: trimToLength(mapping?.customSerialNumber, 32, "..."),
      hardwareVersionString: trimToLength(device?.hw_version, 64, "..."),
      softwareVersionString: trimToLength(device?.sw_version, 64, "..."),
    });
  }

  async factoryReset(): Promise<void> {
    await this.cancel();
    await this.erase();
  }
}
