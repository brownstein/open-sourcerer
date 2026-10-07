import { Object3D } from "three";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { SignalData } from "src/api/signal";
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

export type IOReceiverNodeProps = EntityProps & {
  /**
   * When true, each attached output re-emits the last value broadcast on its
   * channel as soon as the level finishes loading. Lets a persisted channel
   * value restore downstream circuits on level re-entry. No-op for channels
   * nothing has ever broadcast on.
   */
  emitImmediately?: boolean;
};

/**
 * Built-in wireless receiver: re-emits values broadcast by any
 * IOTransmitterNode in the level, with no wire between them. Each attached
 * output listens on the wireless channel matching its name, so an output
 * named `testing` emits whatever an input named `testing` feeds any
 * transmitter. With `emitImmediately`, outputs also fire the channel's
 * persisted value once on level load.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOReceiverNode extends CoreEntity {
  static type = "IOReceiverNode";
  public type = IOReceiverNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly emitImmediately: boolean;
  private readonly channelUnsubs = new Map<string, () => void>();
  private readonly pending = new Map<string, SignalData>();
  private hasEmitted = false;
  private lastEmitted: SignalData = null;
  private steppedOnce = false;

  constructor(props: IOReceiverNodeProps) {
    super(props);
    this.emitImmediately = props.emitImmediately ?? false;

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
        frameColor: "#2dd4bf",
        displayText: () => ({
          lines: [this.hasEmitted ? String(this.lastEmitted) : "rx"]
        }),
        process: (inputs, outputs) => {
          const emitted = new Map<string, SignalData>();
          for (const [name, value] of this.pending) {
            if (!outputs.has(name)) continue;
            emitted.set(name, value);
            this.hasEmitted = true;
            this.lastEmitted = value;
          }
          this.pending.clear();
          return emitted;
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    this.behaviors.processor.events.on("ioReorganized", ({ outputs }) => {
      const names = new Set<string>();
      for (const output of outputs.values()) {
        if (output.name !== undefined) names.add(output.name);
      }
      this.syncChannelSubscriptions(names);
    });

    // Wireless values that arrive before the first step (persisted channel
    // replays during load) are held until the level is running, when wires
    // and terminals are guaranteed to be linked.
    this.events.once(EntityLifecycleEvents.Step, () => {
      this.steppedOnce = true;
      if (this.pending.size > 0) this.behaviors.processor.queueProcessing();
    });
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    for (const unsub of this.channelUnsubs.values()) unsub();
    this.channelUnsubs.clear();
    this.pending.clear();
  }

  private syncChannelSubscriptions(names: Set<string>) {
    for (const [name, unsub] of this.channelUnsubs) {
      if (names.has(name)) continue;
      unsub();
      this.channelUnsubs.delete(name);
      this.pending.delete(name);
    }
    for (const name of names) {
      if (this.channelUnsubs.has(name)) continue;
      this.subscribeToChannel(name);
    }
  }

  private subscribeToChannel(name: string) {
    const state = this.level?.state;
    if (!state) return;
    // subValue synchronously replays an already-set value; only accept the
    // replay when configured to restore the persisted channel value.
    let replaying = true;
    const unsub = state.subValue<SignalData>(
      wirelessChannelKey(name),
      (value) => {
        if (replaying && !this.emitImmediately) return;
        this.pending.set(name, value);
        if (this.steppedOnce) this.behaviors.processor.queueProcessing();
      }
    );
    replaying = false;
    this.channelUnsubs.set(name, unsub);
  }
}
