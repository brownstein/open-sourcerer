import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { EntityCodeInjectionAPI } from "src/api/entityCodeInjection";
import { SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import {
  CustomTextInput,
  SignalProcessorBehavior
} from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";
import { InteractionBehavior } from "../behaviors/InteractionBehavior";

export type IOCustomNodeProps = EntityProps & {
  /** Optional prompt shown in the entityCode modal when the player interacts. */
  promptString?: string;
  titleString?: string;
  defaultCode?: string;
  immutable?: boolean;
  canInteract?: boolean;
};

/**
 * Logic node sitting between input and output terminals, running a
 * user-editable JS processor. Press E to open the entityCode modal and edit
 * the code; each incoming signal is processed in a fresh, headless spell
 * context and the results are emitted to every connected output.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOCustomNode extends CoreEntity implements EntityCodeInjectionAPI {
  static type = "IOCustomNode";
  public type = IOCustomNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  constructor(props: IOCustomNodeProps) {
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
      // the node's connection is the logical node-assembly channel; values
      // arrive through terminals, never from wires directly
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      interaction: new InteractionBehavior(),
      processor: new SignalProcessorBehavior({
        canInteract: props.canInteract ?? true,
        promptString: props.promptString,
        titleString: props.titleString,
        defaultCode: props.defaultCode,
        immutable: props.immutable,
        frameColor: "#4488ff",
        modalArgs: () => ({ initialSize: "large" }),
        displayText: (opt?: CustomTextInput) => {
          if (!opt) return { lines: ["waiting"] };
          return { lines: [String(opt.singleOutput)] };
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);
  }

  acceptCode(code: string) {
    this.behaviors.processor.acceptCode(code);
    this.behaviors.processor.queueProcessing();
  }

  /**
   * For level scripting: attach custom logic that runs when all inputs are
   * supplied (and on any input change thereafter). Returns an unsubscribe.
   */
  attachProcessingCallback(
    callback: (inputs: Record<string, SignalData>) => void
  ): () => void {
    return this.behaviors.processor.attachProcessingCallback(callback);
  }
}
