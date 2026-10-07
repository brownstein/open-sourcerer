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
import { setGlobalChannel } from "src/redux/progression/slice";
import { store } from "src/redux/store";

import { TextPixelated } from "../TextPixelated";

/**
 * Built-in global transmitter: broadcasts each named input it receives onto a
 * game-wide channel of the same name, with no wire between them. Every
 * IOGlobalReceiverNode in any level with an output named like the input
 * re-emits the value. Channels live in game progression state, so values
 * cross levels and persist in the save file. Unlike the level-local wireless
 * pair, rebroadcasting an unchanged value does not re-fire receivers.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOGlobalTransmitterNode extends CoreEntity {
  static type = "IOGlobalTransmitterNode";
  public type = IOGlobalTransmitterNode.type;

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
        frameColor: "#f59e0b",
        displayText: () => ({
          lines: [this.hasSent ? String(this.lastSent) : "gtx"]
        }),
        process: (inputs) => {
          for (const name of this.pendingBroadcastNames) {
            const value = inputs.get(name);
            if (value === undefined) continue;
            store.dispatch(setGlobalChannel({ name, value }));
            this.hasSent = true;
            this.lastSent = value;
          }
          this.pendingBroadcastNames.clear();
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

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
