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
import { selectGlobalChannels } from "src/redux/progression/selectors";
import { store } from "src/redux/store";

import { TextPixelated } from "../TextPixelated";

/**
 * Built-in global receiver: re-emits values broadcast by any
 * IOGlobalTransmitterNode in any level, with no wire between them. Each
 * attached output listens on the game-wide channel matching its name, and
 * always fires the channel's stored value once on level load, so circuits
 * restore from broadcasts made in other levels or before saving. Unchanged
 * values do not re-fire.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOGlobalReceiverNode extends CoreEntity {
  static type = "IOGlobalReceiverNode";
  public type = IOGlobalReceiverNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly watchedNames = new Set<string>();
  private readonly lastSeen = new Map<string, SignalData>();
  private readonly pending = new Map<string, SignalData>();
  private hasEmitted = false;
  private lastEmitted: SignalData = null;
  private steppedOnce = false;
  private storeUnsub?: () => void;

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
        frameColor: "#fb923c",
        displayText: () => ({
          lines: [this.hasEmitted ? String(this.lastEmitted) : "grx"]
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
      this.watchedNames.clear();
      for (const output of outputs.values()) {
        if (output.name !== undefined) this.watchedNames.add(output.name);
      }
      this.pullChannels();
    });

    this.events.once(EntityLifecycleEvents.Step, () => {
      this.steppedOnce = true;
      if (this.pending.size > 0) this.behaviors.processor.queueProcessing();
    });
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.storeUnsub = store.subscribe(() => this.pullChannels());
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    this.storeUnsub?.();
    this.storeUnsub = undefined;
    this.pending.clear();
  }

  private pullChannels() {
    const channels = selectGlobalChannels(store.getState());
    for (const name of this.watchedNames) {
      if (!(name in channels)) continue;
      const value = channels[name];
      if (
        this.lastSeen.has(name) &&
        Object.is(this.lastSeen.get(name), value)
      ) {
        continue;
      }
      this.lastSeen.set(name, value);
      this.pending.set(name, value);
      if (this.steppedOnce) this.behaviors.processor.queueProcessing();
    }
  }
}
