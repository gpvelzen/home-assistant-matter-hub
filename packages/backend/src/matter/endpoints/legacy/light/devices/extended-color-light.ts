import type { ColorControl } from "@matter/main/clusters";
import { ExtendedColorLightDevice as Device } from "@matter/main/devices";
import type { FeatureSelection } from "../../../../../utils/feature-selection.js";
import { BasicInformationServer } from "../../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../../behaviors/identify-server.js";
import { DefaultPowerSourceServer } from "../../../../behaviors/power-source-server.js";
import { LightColorControlServer } from "../behaviors/light-color-control-server.js";
import { LightLevelControlServer } from "../behaviors/light-level-control-server.js";
import { LightOnOffServer } from "../behaviors/light-on-off-server.js";

export const ExtendedColorLightType = (
  supportsColorControl: boolean,
  supportsTemperature: boolean,
  hasBattery = false,
) => {
  const features: FeatureSelection<ColorControl.Cluster> = new Set();
  if (supportsColorControl) {
    features.add("HueSaturation");
  }
  if (supportsTemperature) {
    features.add("ColorTemperature");
  }

  if (hasBattery) {
    return Device.with(
      IdentifyServer,
      BasicInformationServer,
      HomeAssistantEntityBehavior,
      LightOnOffServer,
      LightLevelControlServer,
      LightColorControlServer.with(...features),
      DefaultPowerSourceServer,
    );
  }

  return Device.with(
    IdentifyServer,
    BasicInformationServer,
    HomeAssistantEntityBehavior,
    LightOnOffServer,
    LightLevelControlServer,
    LightColorControlServer.with(...features),
  );
};
