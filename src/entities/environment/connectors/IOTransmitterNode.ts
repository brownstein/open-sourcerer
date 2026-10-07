import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { SignalConnectionEvents, SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import { SignalProcessorBehavior } from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";
import { wirelessChannelKey } from "./wirelessChannel";

/**
 * Built-in wireless transmitter: broadcasts each named input it receives onto
 * a level-wide wireless channel of the same name, with no wire between them.
 * Every IOReceiverNode in the level with an output named like the input
 * re-emits the value. Channels live in level state, so the last value sent on
 * each one persists across level exit and re-entry (see `emitImmediately` on
 * the receiver). Each received pulse broadcasts, including repeats of the
 * same value.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOTransmitterNode extends CoreEntity {
  static type = "IOTransmitterNode";
  public type = IOTransmitterNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly pendingBroadcastNames = new Set<string>();
  private hasSent = false;
  private lastSent: SignalData = null;

  constructor(props: EntityProps) {
    super(props);

    if (!this.size.width || !this.size.height) {
      this.size = { width: 1, height: 1 };
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors = {
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      processor: new SignalProcessorBehavior({
        requireAllInputs: false,
        frameColor: "#22d3ee",
        displayText: () => ({
          lines: [this.hasSent ? String(this.lastSent) : "tx"]
        }),
        process: (inputs) => {
          const state = this.level?.state;
          if (state) {
            for (const name of this.pendingBroadcastNames) {
              const value = inputs.get(name);
              if (value === undefined) continue;
              state.setValue(wirelessChannelKey(name), value);
              this.hasSent = true;
              this.lastSent = value;
            }
          }
          this.pendingBroadcastNames.clear();
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    // Every input shows up in each processing pass with its latched value;
    // track the names that fired since the last pass so only fresh pulses
    // broadcast, never idle or previously sent channels.
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.name !== undefined) {
          this.pendingBroadcastNames.add(signal.name);
        }
      }
    );
  }
}
