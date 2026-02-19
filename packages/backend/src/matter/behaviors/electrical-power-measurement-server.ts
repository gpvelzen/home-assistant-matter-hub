import { Logger } from "@matter/general";
import { ElectricalPowerMeasurementServer as Base } from "@matter/main/behaviors";
import { ElectricalPowerMeasurement } from "@matter/main/clusters";
import { EntityStateProvider } from "../../services/bridges/entity-state-provider.js";
import { applyPatchState } from "../../utils/apply-patch-state.js";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";

const logger = Logger.get("ElectricalPowerMeasurementServer");

// biome-ignore lint/correctness/noUnusedVariables: Used via namespace below
class ElectricalPowerMeasurementServerBase extends Base {
  declare state: ElectricalPowerMeasurementServerBase.State;

  override async initialize() {
    await super.initialize();

    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    const entityId = homeAssistant.entityId;
    const powerEntity = homeAssistant.state.mapping?.powerEntity;

    if (powerEntity) {
      logger.debug(
        `[${entityId}] ElectricalPowerMeasurement using mapped power entity: ${powerEntity}`,
      );
    }

    this.update();
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update() {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const powerEntity = homeAssistant.state.mapping?.powerEntity;

    if (!powerEntity) return;

    const stateProvider = this.agent.env.get(EntityStateProvider);
    const powerWatts = stateProvider.getNumericState(powerEntity);

    // Matter uses milliwatts (int64)
    const activePower =
      powerWatts != null ? Math.round(powerWatts * 1000) : null;

    applyPatchState(this.state, { activePower });
  }
}

namespace ElectricalPowerMeasurementServerBase {
  export class State extends Base.State {}
}

export const HaElectricalPowerMeasurementServer =
  ElectricalPowerMeasurementServerBase.set({
    powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
    numberOfMeasurementTypes: 1,
    accuracy: [
      {
        measurementType: ElectricalPowerMeasurement.MeasurementType.ActivePower,
        measured: true,
        minMeasuredValue: 1, // Cannot be 0 (reserved as "null" in Matter spec)
        maxMeasuredValue: 100_000_000, // 100kW in mW
        accuracyRanges: [
          {
            rangeMin: 1,
            rangeMax: 100_000_000,
            fixedMax: 1000, // 1W accuracy
          },
        ],
      },
    ],
  });
