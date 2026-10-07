import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import {
  SignalProcessorBehavior,
  deriveOutputsFor
} from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";

/**
 * Built-in set/reset latch: a single bit that a `set` pulse turns on and a
 * `reset` pulse turns off, holding its state and emitting it on change. When
 * both fire together, reset wins.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOSetResetNode extends CoreEntity {
  static type = "IOSetResetNode";
  public type = IOSetResetNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private on = false;

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
        frameColor: "#ef4444",
        displayText: () => ({ lines: [String(this.on)] }),
        process: (inputs, outputs) => {
          let changed = false;
          if (inputs.get("set")) {
            if (!this.on) {
              this.on = true;
              changed = true;
            }
            this.behaviors.processor.consumeInput("set");
          }
          if (inputs.get("reset")) {
            if (this.on) {
              this.on = false;
              changed = true;
            }
            this.behaviors.processor.consumeInput("reset");
          }
          return changed
            ? deriveOutputsFor(this.on, outputs)
            : new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
