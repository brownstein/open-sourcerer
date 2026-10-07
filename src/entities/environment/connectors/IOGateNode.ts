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
 * Built-in gate: passes each `value` pulse through once while `enable` is
 * truthy. `enable` is a held level; `value` is a momentary pulse. A `value`
 * that arrives while the gate is closed is dropped, so put an IOHoldNode
 * upstream when you need to latch a level. Wire inputs named `value` and
 * `enable` plus an output.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOGateNode extends CoreEntity {
  static type = "IOGateNode";
  public type = IOGateNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private passed?: SignalData;

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
        frameColor: "#22c55e",
        displayText: () => ({
          lines: [this.passed === undefined ? "gate" : String(this.passed)]
        }),
        process: (inputs, outputs) => {
          const value = inputs.get("value");
          if (value === undefined || value === null) {
            return new Map<string, SignalData>();
          }
          // Consume even when closed so a pulse never passes more than once.
          this.behaviors.processor.consumeInput("value");
          if (!inputs.get("enable")) {
            return new Map<string, SignalData>();
          }
          this.passed = value;
          return deriveOutputsFor(value, outputs);
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
