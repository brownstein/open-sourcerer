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

export type BasicArithmeticOperator = "+" | "-" | "*" | "/";
export type AdvancedArithmeticOperator = "%" | "min" | "max";
export type ArithmeticOperator =
  | BasicArithmeticOperator
  | AdvancedArithmeticOperator;

const BASIC_OPERATORS: BasicArithmeticOperator[] = ["+", "-", "*", "/"];
const ADVANCED_OPERATORS: AdvancedArithmeticOperator[] = ["%", "min", "max"];
const ALL_OPERATORS: ArithmeticOperator[] = [
  ...BASIC_OPERATORS,
  ...ADVANCED_OPERATORS
];

export function isArithmeticOperator(
  value: unknown
): value is ArithmeticOperator {
  return ALL_OPERATORS.includes(value as ArithmeticOperator);
}

const DISPLAY_SYMBOL: Record<ArithmeticOperator, string> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
  min: "min",
  max: "max"
};

function labelFor(op: ArithmeticOperator): string {
  if (op === "min" || op === "max") return `${op}(A, B)`;
  return `A ${DISPLAY_SYMBOL[op]} B`;
}

// min/max have no infix form, so they compile to Math calls; the rest are
// plain binary expressions. Empty code when no operator is chosen yet, so the
// processor emits nothing until the player picks one.
function buildCode(op: ArithmeticOperator | undefined): string {
  if (!op) return "";
  if (op === "min") return "output = Math.min(a, b);";
  if (op === "max") return "output = Math.max(a, b);";
  return `output = a ${op} b;`;
}

export type IOArithmeticNodeProps = EntityProps & {
  /** Expose `%`, `min`, and `max` alongside the basic `+ − × ÷` operators. */
  advancedOperators?: boolean;
  initialValue?: ArithmeticOperator;
  immutable?: boolean;
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

/**
 * Built-in processing node: binary math on two inputs `a` and `b`, output
 * bound to `output`. Mirrors the operator node — code is empty until the
 * player picks an operator from the modal dropdown. `+ − × ÷` are always
 * offered; `advancedOperators` adds `%`, `min`, and `max`.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOArithmeticNode
  extends CoreEntity
  implements EntityCodeInjectionAPI
{
  static type = "IOArithmeticNode";
  public type = IOArithmeticNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  private operator?: ArithmeticOperator;
  private readonly showAdvanced: boolean;
  private readonly immutable: boolean;

  constructor(props: IOArithmeticNodeProps) {
    super(props);

    this.showAdvanced = props.advancedOperators ?? false;
    this.immutable = props.immutable ?? false;
    if (isArithmeticOperator(props.initialValue)) {
      this.operator = props.initialValue;
    }

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
        canInteract: props.canInteract ?? true,
        immutable: true,
        frameColor: "#eab308",
        displayText: (opt) => {
          if (!opt) return { lines: [this.expression()] };
          const output = String(deriveSingleOutput(opt.outputs) ?? "");
          return { lines: [this.expression(), output] };
        },
        promptString:
          props.promptString ??
          "Arithmetic node. Pick a binary math operator to apply to inputs " +
            "`a` and `b`; the result is sent to every connected output.",
        titleString: props.titleString,
        modalArgs: () => ({
          titleKey: "modals.entityCode.titleWithOperator",
          valueEditor: {
            kind: "choices",
            label: "Operator",
            value: this.operator,
            locked: this.immutable,
            choices: this.buildOperatorOptions().map((op) => ({
              value: op,
              label: labelFor(op)
            }))
          }
        })
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);

    if (this.operator) {
      this.behaviors.processor.setCode(buildCode(this.operator));
      this.behaviors.processor.queueProcessing();
    }
  }

  private expression(): string {
    return this.operator ? labelFor(this.operator) : "A ? B";
  }

  private buildOperatorOptions(): ArithmeticOperator[] {
    const options: ArithmeticOperator[] = [...BASIC_OPERATORS];
    if (this.showAdvanced) options.push(...ADVANCED_OPERATORS);
    // always offer the current operator, even if advanced isn't enabled
    if (this.operator && !options.includes(this.operator)) {
      options.unshift(this.operator);
    }
    return options;
  }

  acceptPromptResult(result: string) {
    this.setOperator(result as ArithmeticOperator);
  }

  private setOperator(op: ArithmeticOperator) {
    if (this.immutable) return;
    if (op === this.operator) return;
    this.operator = op;
    this.behaviors.processor.setCode(buildCode(op));
    this.behaviors.processor.queueProcessing();
    this.behaviors.processor.updateOpenModal();
  }
}
