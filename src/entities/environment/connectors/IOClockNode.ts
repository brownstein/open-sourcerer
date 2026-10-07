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

import { TextPixelated } from "../TextPixelated";

const DEFAULT_PERIOD_MS = 1000;
const MIN_PERIOD_MS = 100;

export type IOClockNodeProps = EntityProps & {
  /** Milliseconds between ticks. */
  periodMs?: number;
};

/**
 * Built-in clock: a source that emits a `true` pulse on `output` at a fixed
 * interval, free-running from the moment the level starts. A pulse on the
 * optional `reset` input restarts the interval from zero. Feed a counter's
 * `step`, or gate the pulse, to drive timed sequences without hand-building a
 * feedback loop.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOClockNode extends CoreEntity {
  static type = "IOClockNode";
  public type = IOClockNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly periodMs: number;
  private elapsedMs = 0;

  constructor(props: IOClockNodeProps) {
    super(props);

    this.periodMs = Math.max(
      MIN_PERIOD_MS,
      props.periodMs ?? DEFAULT_PERIOD_MS
    );

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
        frameColor: "#6366f1",
        displayText: () => ({
          lines: [`${(this.periodMs / 1000).toFixed(1)}s`]
        }),
        process: (inputs, outputs) => {
          // Honour a `reset`-named terminal or a single unnamed one, which
          // resolves to `input`. A reset restarts the interval without ticking.
          if (inputs.get("reset") ?? inputs.get("input")) {
            this.elapsedMs = 0;
            this.behaviors.processor.consumeInput("reset");
            this.behaviors.processor.consumeInput("input");
            return new Map<string, SignalData>();
          }
          return deriveOutputsFor(true, outputs);
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    this.events.on(EntityLifecycleEvents.Step, (ms) => this.advance(ms));
  }

  private advance(ms: number) {
    this.elapsedMs += ms;
    if (this.elapsedMs < this.periodMs) return;
    this.elapsedMs -= this.periodMs;
    this.behaviors.processor.queueProcessing();
  }
}
