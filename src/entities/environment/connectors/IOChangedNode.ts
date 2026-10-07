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
 * Built-in change filter: remembers the last value it saw and passes `input`
 * through only when it differs, suppressing repeats. Turns a held level into
 * edges and keeps feedback loops from re-firing on unchanged values.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOChangedNode extends CoreEntity {
  static type = "IOChangedNode";
  public type = IOChangedNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private hasLast = false;
  private last: SignalData = null;

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
        frameColor: "#ec4899",
        displayText: () => ({
          lines: [this.hasLast ? String(this.last) : "changed"]
        }),
        process: (inputs, outputs) => {
          const value = inputs.get("input") ?? null;
          if (!this.hasLast || value !== this.last) {
            this.hasLast = true;
            this.last = value;
            return deriveOutputsFor(value, outputs);
          }
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
