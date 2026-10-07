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
 * Built-in counter: holds a number, adds one on each `step` pulse and returns
 * to zero on each `reset` pulse, emitting the running count. Stop-at-N and
 * wrapping are built by gating `step` with a comparator on the count.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOCounterNode extends CoreEntity {
  static type = "IOCounterNode";
  public type = IOCounterNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private count = 0;

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
        frameColor: "#06b6d4",
        displayText: () => ({ lines: [String(this.count)] }),
        process: (inputs, outputs) => {
          let changed = false;
          if (inputs.get("step")) {
            this.count++;
            this.behaviors.processor.consumeInput("step");
            changed = true;
          }
          if (inputs.get("reset")) {
            this.count = 0;
            this.behaviors.processor.consumeInput("reset");
            changed = true;
          }
          return changed
            ? deriveOutputsFor(this.count, outputs)
            : new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
