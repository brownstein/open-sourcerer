import { Object3D } from "three";

import { ComplexData, PrimitiveTypeName, resolvePrimitive } from "src/api/data";
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

export type IOFilterNodeProps = EntityProps & {
  /** Which signals get through. Ignored while `matchValue` is set. */
  pass?: "truthy" | "falsy" | "any";
  /** When set, only signals strictly equal to this value get through. */
  matchValue?: SignalData;
  /** Forces the match value's type; inferred from the value when omitted. */
  matchDataType?: PrimitiveTypeName;
};

/**
 * Built-in filter: passes an incoming signal through unchanged when it meets
 * the node's condition and emits nothing when it does not. Defaults to letting
 * truthy values through; `pass: "any"` makes it a plain one-way pass-through
 * for blocking backflow in a loop, and `matchValue` turns it into an exact
 * match gate for branching on a specific value.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOFilterNode extends CoreEntity {
  static type = "IOFilterNode";
  public type = IOFilterNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly passMode: "truthy" | "falsy" | "any";
  private readonly matchTarget?: ComplexData;

  constructor(props: IOFilterNodeProps) {
    super(props);

    this.passMode = props.pass ?? "truthy";
    this.matchTarget =
      props.matchValue === undefined
        ? undefined
        : resolvePrimitive(props.matchValue, props.matchDataType);

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
        frameColor: "#d946ef",
        displayText: () => ({
          lines: [
            this.matchTarget === undefined
              ? this.passMode
              : String(this.matchTarget)
          ]
        }),
        process: (inputs, outputs) => {
          const value = inputs.get("input") ?? null;
          if (!this.passes(value)) return new Map<string, SignalData>();
          return deriveOutputsFor(value, outputs);
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }

  private passes(value: SignalData) {
    if (this.matchTarget !== undefined) return value === this.matchTarget;
    if (this.passMode === "any") return true;
    if (this.passMode === "falsy") return !value;
    return !!value;
  }
}
