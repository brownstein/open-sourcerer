import { Object3D } from "three";

import {
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
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
import { selectCutScenesCompleted } from "src/redux/progression/selectors";
import { completeCutScene } from "src/redux/progression/slice";
import { store } from "src/redux/store";

import { TextPixelated } from "../TextPixelated";

const INPUT_NAME = "input";
const MAX_DISPLAYED_ID_LENGTH = 12;
const ERROR_COLOR = "#ff6666";

export type IOCutsceneMode =
  | "startCutscene"
  | "completeCutscene"
  | "checkCutscene";

export type IOCutsceneNodeProps = EntityProps & {
  /** Progression id of the cutscene this node gates on. */
  cutsceneId?: string;
  mode?: IOCutsceneMode;
  /** checkCutscene only: also emit the stored state once on level load. */
  checkCutsceneImmediately?: boolean;
};

/**
 * Built-in cutscene gate: reads and writes the saved cutscene progression that
 * decides whether a scene should play at all. `startCutscene` passes a trigger
 * through only while its cutscene is unseen, `completeCutscene` marks it seen
 * and chains onward, and `checkCutscene` reports the stored state as a boolean
 * for branching. Keeps a signal-built cutscene from replaying on every visit.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOCutsceneNode extends CoreEntity {
  static type = "IOCutsceneNode";
  public type = IOCutsceneNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly cutsceneId?: string;
  private readonly mode: IOCutsceneMode;
  private emitStateOnLoad = false;

  constructor(props: IOCutsceneNodeProps) {
    super(props);

    this.cutsceneId = props.cutsceneId;
    this.mode = props.mode ?? "startCutscene";

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
        frameColor: "#8b5cf6",
        displayText: () => this.describeCutscene(),
        process: (inputs, outputs) => this.evaluate(inputs, outputs)
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    if (this.mode === "checkCutscene" && props.checkCutsceneImmediately) {
      // Emit on first step, not preload: by then terminals have linked.
      this.events.once(EntityLifecycleEvents.Step, () => {
        this.emitStateOnLoad = true;
        this.behaviors.processor.queueProcessing();
      });
    }
  }

  private evaluate(inputs: Map<string, SignalData>, outputs: Set<string>) {
    const silent = new Map<string, SignalData>();
    const triggered = !!inputs.get(INPUT_NAME);
    this.behaviors.processor.consumeInput(INPUT_NAME);
    const emitOnLoad = this.emitStateOnLoad;
    this.emitStateOnLoad = false;

    if (!this.cutsceneId) return silent;
    const completed = this.isCompleted();

    if (this.mode === "checkCutscene") {
      if (!triggered && !emitOnLoad) return silent;
      return deriveOutputsFor(completed, outputs);
    }
    if (!triggered) return silent;
    if (this.mode === "completeCutscene") {
      store.dispatch(completeCutScene(this.cutsceneId));
      return deriveOutputsFor(true, outputs);
    }
    if (completed) return silent;
    return deriveOutputsFor(true, outputs);
  }

  private isCompleted() {
    if (!this.cutsceneId) return false;
    return !!selectCutScenesCompleted(store.getState())[this.cutsceneId];
  }

  private describeCutscene() {
    if (!this.cutsceneId) return { lines: ["no id"], color: ERROR_COLOR };
    const state = this.isCompleted()
      ? "done"
      : this.mode === "completeCutscene"
        ? "complete"
        : this.mode === "checkCutscene"
          ? "check"
          : "start";
    return {
      lines: [this.cutsceneId.slice(0, MAX_DISPLAYED_ID_LENGTH), state]
    };
  }
}
