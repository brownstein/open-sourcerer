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

const DEFAULT_DELAY_MS = 1000;

export type IODelayNodeProps = EntityProps & {
  /** Milliseconds each signal is held before being re-emitted. */
  delayMs?: number;
};

type DelayedSignal = {
  value: SignalData;
  remainingMs: number;
};

/**
 * Built-in delay: re-emits every incoming signal, value untouched, `delayMs`
 * later. Signals queue in arrival order, so a burst comes back out as the same
 * burst shifted in time. The building block for timed sequences — chain a few
 * to space out cutscene beats without hand-building clock and counter logic.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IODelayNode extends CoreEntity {
  static type = "IODelayNode";
  public type = IODelayNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly delayMs: number;
  private readonly waiting: DelayedSignal[] = [];
  private readonly expired: SignalData[] = [];

  constructor(props: IODelayNodeProps) {
    super(props);

    this.delayMs = Math.max(0, props.delayMs ?? DEFAULT_DELAY_MS);

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
        frameColor: "#84cc16",
        displayText: () => ({
          lines: [`${(this.delayMs / 1000).toFixed(1)}s`]
        }),
        process: (inputs, outputs) => {
          const incoming = inputs.get("input") ?? null;
          if (incoming !== null) {
            this.waiting.push({ value: incoming, remainingMs: this.delayMs });
            this.behaviors.processor.consumeInput("input");
          }
          if (this.expired.length === 0) return new Map<string, SignalData>();
          const [ready] = this.expired.splice(0, 1);
          return deriveOutputsFor(ready, outputs);
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    this.events.on(EntityLifecycleEvents.Step, (ms) => this.advance(ms));
  }

  private advance(ms: number) {
    if (this.waiting.length === 0) return;
    for (const entry of this.waiting) entry.remainingMs -= ms;
    // Every entry waits the same span, so entries always expire in arrival
    // order and only the head of the queue can be due.
    while (this.waiting.length > 0 && this.waiting[0].remainingMs <= 0) {
      const [due] = this.waiting.splice(0, 1);
      this.expired.push(due.value);
      this.behaviors.processor.queueProcessing();
    }
  }
}
