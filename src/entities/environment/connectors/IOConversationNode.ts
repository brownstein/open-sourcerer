import { Object3D } from "three";

import { Conversation } from "src/api/conversation";
import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { SignalData } from "src/api/signal";
import { typedEmitterPromise } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import { SignalProcessorBehavior } from "src/entities/shared/behaviors/SignalProcessorBehavior";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";

import { TextPixelated } from "../TextPixelated";

const INPUT_NAME = "input";
const STEP_OUTPUT = "step";
const COMPLETE_OUTPUT = "complete";

export type IOConversationNodeProps = EntityProps & {
  /** Dialogue to play, in the same shape `HintGlimmer` takes. */
  conversation?: Conversation<string, string>;
};

/**
 * Built-in conversation player: a truthy input opens the node's dialogue, the
 * `step` output names each line as it starts, and `complete` names the line the
 * player finished on. Wiring `complete` through an IOEqualsNode is how a
 * signal-built cutscene branches on a dialogue choice. Non-interruptible — a
 * second trigger mid-conversation is ignored rather than restarting it.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOConversationNode extends CoreEntity {
  static type = "IOConversationNode";
  public type = IOConversationNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly conversation?: Conversation<string, string>;
  private readonly pending = new Map<string, SignalData>();
  private overlayConversation?: OverlayConversation;
  private currentStepName?: string;

  constructor(props: IOConversationNodeProps) {
    super(props);

    this.conversation = props.conversation;

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
        frameColor: "#10b981",
        displayText: () => ({
          lines: [this.currentStepName ?? "convo"]
        }),
        process: (inputs, outputs) => {
          const trigger = inputs.get(INPUT_NAME);
          this.behaviors.processor.consumeInput(INPUT_NAME);
          if (trigger && !this.overlayConversation) this.startConversation();

          const emitted = new Map<string, SignalData>();
          for (const [name, value] of this.pending) {
            if (!outputs.has(name)) continue;
            emitted.set(name, value);
          }
          this.pending.clear();
          return emitted;
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }

  detachFromLevel(level: EntityLevelAPI) {
    this.closeConversation();
    super.detachFromLevel(level);
  }

  destroy() {
    this.closeConversation();
    super.destroy();
  }

  private async startConversation() {
    const level = this.level;
    const conversation = this.conversation;
    if (!level || !conversation?.steps) return;

    const overlay = new OverlayConversation({
      position: this.position.clone(),
      conversation: this.instrumentConversation(conversation)
    });
    this.overlayConversation = overlay;
    this.currentStepName = conversation.start;

    const completion = typedEmitterPromise(
      overlay.conversationEvents,
      "complete"
    );
    level.addEntity(overlay);
    const lastStepName = await completion;

    overlay.manualDetach();
    this.overlayConversation = undefined;
    this.currentStepName = undefined;
    this.emitSignal(COMPLETE_OUTPUT, lastStepName);
  }

  private instrumentConversation(
    conversation: Conversation<string, string>
  ): Conversation<string, string> {
    const steps: Conversation<string, string>["steps"] = {};
    for (const [stepName, step] of Object.entries(conversation.steps)) {
      steps[stepName] = {
        ...step,
        onStart: () => {
          step.onStart?.();
          this.currentStepName = stepName;
          this.emitSignal(STEP_OUTPUT, stepName);
        }
      };
    }
    return { ...conversation, steps };
  }

  private emitSignal(name: string, value: SignalData) {
    this.pending.set(name, value);
    this.behaviors.processor.queueProcessing();
  }

  private closeConversation() {
    this.overlayConversation?.manualDetach();
    this.overlayConversation = undefined;
    this.currentStepName = undefined;
    this.pending.clear();
  }
}
