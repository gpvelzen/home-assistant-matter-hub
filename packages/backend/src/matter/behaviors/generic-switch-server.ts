import type { EventDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { SwitchServer as Base } from "@matter/main/behaviors";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";

const logger = Logger.get("GenericSwitchServer");

const FeaturedBase = Base.with(
  "MomentarySwitch",
  "MomentarySwitchRelease",
  "MomentarySwitchLongPress",
  "MomentarySwitchMultiPress",
);

// biome-ignore lint/correctness/noUnusedVariables: Used via namespace below
class GenericSwitchServerBase extends FeaturedBase {
  declare state: GenericSwitchServerBase.State;
  private inLongPress = false;

  override async initialize() {
    await super.initialize();

    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    const entityId = homeAssistant.entityId;

    logger.debug(`[${entityId}] GenericSwitch initialized`);

    this.reactTo(homeAssistant.onChange, this.handleEventChange);
  }

  private handleEventChange() {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const entity = homeAssistant.entity;
    if (!entity?.state || !entity.state.attributes) return;

    const attrs = entity.state.attributes as EventDeviceAttributes;
    const eventType = attrs.event_type;

    if (!eventType) return;

    const entityId = homeAssistant.entityId;
    logger.debug(`[${entityId}] Event fired: ${eventType}`);

    this.triggerPress(eventType);
  }

  private triggerPress(eventType: string) {
    const lower = eventType.toLowerCase();

    // Long press start (e.g. press_long, long_press)
    if (this.isLongPress(lower)) {
      this.inLongPress = true;
      this.state.currentPosition = 1;
      this.events.initialPress?.emit({ newPosition: 1 }, this.context);
      this.events.longPress?.emit({ newPosition: 1 }, this.context);
      this.fireBridgeEvent(eventType, 1);
      return;
    }

    // Long press release (e.g. press_long_release, long_release)
    if (this.isLongRelease(lower)) {
      if (!this.inLongPress) {
        // Synthesize the missing InitialPress + LongPress when the
        // preceding press_long was lost (e.g. coalesced by debounce).
        this.state.currentPosition = 1;
        this.events.initialPress?.emit({ newPosition: 1 }, this.context);
        this.events.longPress?.emit({ newPosition: 1 }, this.context);
      }
      this.inLongPress = false;
      this.state.currentPosition = 0;
      this.events.longRelease?.emit({ previousPosition: 1 }, this.context);
      this.fireBridgeEvent(eventType, 1);
      return;
    }

    // Continuous hold (e.g. press_cont) — ignore, longPress already sent
    if (lower.includes("cont") && lower.includes("press")) {
      return;
    }

    // Standard momentary press (short press, single press, multi-press)
    const pressCount = this.getPressCount(lower);

    // Emit all events synchronously within the reactor context.
    // Using setTimeout + this.callback() causes expired-reference errors
    // because the transaction context is no longer valid after event emission.
    this.state.currentPosition = 1;
    this.events.initialPress?.emit({ newPosition: 1 }, this.context);
    this.state.currentPosition = 0;
    this.events.shortRelease?.emit({ previousPosition: 1 }, this.context);
    this.events.multiPressComplete?.emit(
      {
        previousPosition: 0,
        totalNumberOfPressesCounted: pressCount,
      },
      this.context,
    );

    this.fireBridgeEvent(eventType, pressCount);
  }

  private fireBridgeEvent(eventType: string, pressCount: number) {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    homeAssistant.fireEvent("hamh_action", {
      action: "press",
      event_type: eventType,
      press_count: pressCount,
      source: "matter_bridge",
    });
  }

  private isLongPress(lower: string): boolean {
    return (
      (lower.includes("long") && !lower.includes("release")) || lower === "hold"
    );
  }

  private isLongRelease(lower: string): boolean {
    return lower.includes("long") && lower.includes("release");
  }

  private getPressCount(lower: string): number {
    if (
      lower.includes("triple") ||
      lower.includes("3_press") ||
      lower.includes("three")
    ) {
      return 3;
    }
    if (
      lower.includes("double") ||
      lower.includes("2_press") ||
      lower.includes("two") ||
      lower.includes("multi")
    ) {
      return 2;
    }
    return 1;
  }
}

namespace GenericSwitchServerBase {
  export class State extends FeaturedBase.State {}
}

export const HaGenericSwitchServer = GenericSwitchServerBase.set({
  numberOfPositions: 2,
  currentPosition: 0,
  multiPressMax: 3,
});
