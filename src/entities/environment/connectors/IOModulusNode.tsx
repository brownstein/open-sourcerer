import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { EntityCodeInjectionAPI } from "src/api/entityCodeInjection";
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

const DEFAULT_MIN_DIVISOR = 2;
const DEFAULT_MAX_DIVISOR = 12;

function toInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

function buildCode(divisor: number) {
  return `output = input % ${divisor};`;
}

export type IOModulusNodeProps = EntityProps & {
  /** Smallest selectable divisor. Defaults to 2 (modulus by 1 is always 0). */
  minDivisor?: number;
  /** Largest selectable divisor. Defaults to 12. */
  maxDivisor?: number;
  /** Divisor the node starts with. Defaults to `minDivisor`. */
  initialValue?: number;
  /**
   * Lock the node to its current divisor. The slider becomes read-only and the
   * player cannot change it. Defaults to false.
   */
  immutable?: boolean;
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

/**
 * Built-in processing node: outputs the remainder of a single input divided by
 * a divisor `X`, as `output = input % X`. The player picks X with a horizontal
 * slider in the entityCode modal. Level designers bound the slider via
 * `minDivisor`/`maxDivisor` and can pre-select and lock it.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOModulusNode
  extends CoreEntity
  implements EntityCodeInjectionAPI
{
  static type = "IOModulusNode";
  public type = IOModulusNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  private divisor: number;
  private readonly minDivisor: number;
  private readonly maxDivisor: number;
  private readonly immutable: boolean;

  constructor(props: IOModulusNodeProps) {
    super(props);

    const min = toInteger(props.minDivisor) ?? DEFAULT_MIN_DIVISOR;
    const max = toInteger(props.maxDivisor) ?? DEFAULT_MAX_DIVISOR;
    // guard against an inverted or degenerate range from level data
    this.minDivisor = Math.min(min, max);
    this.maxDivisor = Math.max(min, max);
    this.immutable = props.immutable ?? false;

    const initial = toInteger(props.initialValue) ?? this.minDivisor;
    this.divisor = Math.min(
      this.maxDivisor,
      Math.max(this.minDivisor, initial)
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
      // the node's connection is the logical node-assembly channel; values
      // arrive through terminals, never from wires directly
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      interaction: new InteractionBehavior(),
      processor: new SignalProcessorBehavior({
        canInteract: props.canInteract ?? true,
        // code is generated from the chosen divisor, never hand-edited
        immutable: true,
        frameColor: "#3b82f6",
        displayText: (result) => {
          const label = `% ${this.divisor}`;
          if (!result) return { lines: [label] };
          return {
            lines: [label, String(deriveSingleOutput(result.outputs) ?? "")]
          };
        },
        promptString:
          props.promptString ??
          (this.immutable
            ? `Modulus node locked to a divisor of ${this.divisor}. Outputs ` +
              `the remainder of \`input % ${this.divisor}\`.`
            : "Modulus node. Pick a divisor `X`; outputs the remainder of " +
              "`input % X`. The result is 0 whenever the input divides evenly, " +
              "so it is handy for testing divisibility or wrapping into a range."),
        titleString: props.titleString,
        modalArgs: () => ({
          titleKey: "modals.entityCode.titleWithDivisor",
          valueEditor: {
            kind: "number",
            label: "Divisor",
            value: this.divisor,
            locked: this.immutable,
            range: { min: this.minDivisor, max: this.maxDivisor, step: 1 }
          }
        })
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);

    // seed code so the starting divisor evaluates before any modal interaction
    this.behaviors.processor.setCode(buildCode(this.divisor));
    this.behaviors.processor.queueProcessing();
  }

  acceptPromptResult(result: string) {
    const next = Number(result);
    if (!Number.isFinite(next)) return;
    this.setDivisor(next);
  }

  private setDivisor(value: number) {
    if (this.immutable) return;
    const clamped = Math.min(
      this.maxDivisor,
      Math.max(this.minDivisor, Math.round(value))
    );
    if (clamped === this.divisor) return;
    this.divisor = clamped;
    this.behaviors.processor.setCode(buildCode(clamped));
    this.behaviors.processor.queueProcessing();
    this.behaviors.processor.updateOpenModal();
  }
}
