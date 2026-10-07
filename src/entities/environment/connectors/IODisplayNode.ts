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
 * Built-in display: shows the latest value it receives on `input` and passes
 * it straight through to `output`. Drop it inline on a wire to read a value
 * mid-circuit, or wire only its input to use it as a standalone readout.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IODisplayNode extends CoreEntity {
  static type = "IODisplayNode";
  public type = IODisplayNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private latest: SignalData = null;

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
        frameColor: "#94a3b8",
        // Read off `latest` so the value still shows when no output is wired.
        displayText: () => ({ lines: [String(this.latest ?? "")] }),
        process: (inputs, outputs) => {
          this.latest = inputs.get("input") ?? null;
          return deriveOutputsFor(this.latest, outputs);
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }
}
