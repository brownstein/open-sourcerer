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

export type ComparisonOperator = "==" | "===" | "!=" | "!==";
export type LogicalOperator = "&&" | "||";
export type RelationalOperator = "<=" | "<" | ">=" | ">";
export type Operator =
  | ComparisonOperator
  | LogicalOperator
  | RelationalOperator;

const COMPARISON_OPERATORS: ComparisonOperator[] = ["==", "===", "!=", "!=="];
const LOGICAL_OPERATORS: LogicalOperator[] = ["&&", "||"];
const RELATIONAL_OPERATORS: RelationalOperator[] = ["<=", "<", ">=", ">"];
const ALL_OPERATORS: Operator[] = [
  ...COMPARISON_OPERATORS,
  ...LOGICAL_OPERATORS,
  ...RELATIONAL_OPERATORS
];

export function isOperator(value: unknown): value is Operator {
  return ALL_OPERATORS.includes(value as Operator);
}

// no operator chosen yet → empty code; the processor short-circuits on empty
// code, so nothing is emitted downstream even if inputs arrive and queue a
// processing pass
function buildCode(op: Operator | undefined) {
  if (!op) return "";
  return `output = a ${op} b;`;
}

export type IOOperatorNodeProps = EntityProps & {
  /** Show `==`, `===`, `!=`, `!==` in the dropdown. */
  comparisonOperators?: boolean;
  /** Show `&&`, `||` in the dropdown. */
  logicalOperators?: boolean;
  /** Show `<=`, `<`, `>=`, `>` in the dropdown. */
  relationalOperators?: boolean;
  initialValue?: Operator;
  immutable?: boolean;
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

/**
 * Built-in processing node: binary operator on two inputs `a` and `b`, output
 * bound to `output`. Code is empty until the player picks an operator from
 * the dropdown in the entityCode modal. Level designers pick which categories
 * of operators are available via the three boolean prop flags; the enabled
 * categories are flattened into the modal's operator option list. The modal
 * renders the dropdown from those options and reports the pick back through
 * `acceptPromptResult`.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOOperatorNode
  extends CoreEntity
  implements EntityCodeInjectionAPI
{
  static type = "IOOperatorNode";
  public type = IOOperatorNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  private operator?: Operator;
  private readonly showComparison: boolean;
  private readonly showLogical: boolean;
  private readonly showRelational: boolean;
  private readonly immutable: boolean;

  constructor(props: IOOperatorNodeProps) {
    super(props);

    this.showComparison = props.comparisonOperators ?? false;
    this.showLogical = props.logicalOperators ?? false;
    this.showRelational = props.relationalOperators ?? false;
    this.immutable = props.immutable ?? false;
    if (isOperator(props.initialValue)) {
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
      // the node's connection is the logical node-assembly channel; values
      // arrive through terminals, never from wires directly
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      interaction: new InteractionBehavior(),
      processor: new SignalProcessorBehavior({
        canInteract: props.canInteract ?? true,
        immutable: true,
        frameColor: "#ff4220",
        displayText: (opt) => {
          const expression = `A ${this.operator ?? "?"} B`;
          if (!opt) return { lines: [expression] };
          const output = String(deriveSingleOutput(opt.outputs) ?? "");
          return { lines: [expression, output] };
        },
        promptString:
          props.promptString ??
          "Operator node. Pick a binary operator to apply to inputs " +
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
              label: `a ${op} b`
            }))
          }
        })
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);

    // Seed the processor with the pre-selected operator's code so the node
    // evaluates immediately, before any modal interaction.
    if (this.operator) {
      this.behaviors.processor.setCode(buildCode(this.operator));
      this.behaviors.processor.queueProcessing();
    }
  }

  private buildOperatorOptions(): Operator[] {
    const options: Operator[] = [];
    if (this.showComparison) options.push(...COMPARISON_OPERATORS);
    if (this.showLogical) options.push(...LOGICAL_OPERATORS);
    if (this.showRelational) options.push(...RELATIONAL_OPERATORS);
    // always offer the current operator, even if its category isn't enabled
    if (this.operator && !options.includes(this.operator)) {
      options.unshift(this.operator);
    }
    return options;
  }

  acceptPromptResult(result: string) {
    this.setOperator(result as Operator);
  }

  private setOperator(op: Operator) {
    if (this.immutable) return;
    if (op === this.operator) return;
    this.operator = op;
    this.behaviors.processor.setCode(buildCode(op));
    this.behaviors.processor.queueProcessing();
    this.behaviors.processor.updateOpenModal();
  }
}
