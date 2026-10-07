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
 * Built-in hold: a one-slot register that stores `value` when pulsed on
 * `sample` and emits the stored value each time it is sampled (sample-and-hold).
 * The building block for registers and counters.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOHoldNode extends CoreEntity {
  static type = "IOHoldNode";
  public type = IOHoldNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private stored: SignalData = null;

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
        frameColor: "#a855f7",
        displayText: () => ({
          lines: [this.stored === null ? "hold" : String(this.stored)]
        }),
        process: (inputs, outputs) => {
          if (inputs.get("sample")) {
            this.stored = inputs.get("value") ?? null;
            this.behaviors.processor.consumeInput("sample");
            return deriveOutputsFor(this.stored, outputs);
          }
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
