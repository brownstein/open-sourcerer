import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import {
  SignalProcessorBehavior,
  deriveSingleOutput
} from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";
import { InteractionBehavior } from "../behaviors/InteractionBehavior";

export type IOSubtractNodeProps = EntityProps & {
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

/**
 * Built-in subtract node: a processor node with the immutable code
 * `output = a - b;`. Wire two inputs and an output to it — the modal shows the
 * code read-only.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOSubtractNode extends CoreEntity {
  static type = "IOSubtractNode";
  public type = IOSubtractNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  constructor(props: IOSubtractNodeProps) {
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
      interaction: new InteractionBehavior(),
      processor: new SignalProcessorBehavior({
        displayText: (opt) => {
          if (!opt) return { lines: ["A - B"] };
          return {
            lines: ["A - B", String(deriveSingleOutput(opt.outputs) ?? "")]
          };
        },
        promptString:
          props.promptString ?? "Subtract node. Outputs input A minus input B.",
        titleString: props.titleString,
        defaultCode: "output = a - b;",
        immutable: true,
        canInteract: props.canInteract ?? true
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);
  }
}
