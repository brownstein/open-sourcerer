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

// The exhaustive set of strings the JavaScript `typeof` operator can return.
export type DataTypeName =
  | "undefined"
  | "object"
  | "boolean"
  | "number"
  | "bigint"
  | "string"
  | "symbol"
  | "function";

// Canonical order used to iterate the dropdown options.
const DATA_TYPE_NAMES: DataTypeName[] = [
  "undefined",
  "object",
  "boolean",
  "number",
  "bigint",
  "string",
  "symbol",
  "function"
];

export function isDataTypeName(value: unknown): value is DataTypeName {
  return DATA_TYPE_NAMES.includes(value as DataTypeName);
}

// no type chosen yet → empty code; the processor short-circuits on empty code,
// so nothing is emitted downstream even if the input arrives and queues a
// processing pass
function buildCode(type: DataTypeName | undefined) {
  if (!type) return "";
  return `output = typeof input === "${type}";`;
}

export type IODataTypeNodeProps = EntityProps & {
  /** Show `undefined` in the dropdown. */
  undefinedType?: boolean;
  /** Show `object` in the dropdown. */
  objectType?: boolean;
  /** Show `boolean` in the dropdown. */
  booleanType?: boolean;
  /** Show `number` in the dropdown. */
  numberType?: boolean;
  /** Show `bigint` in the dropdown. */
  bigintType?: boolean;
  /** Show `string` in the dropdown. */
  stringType?: boolean;
  /** Show `symbol` in the dropdown. */
  symbolType?: boolean;
  /** Show `function` in the dropdown. */
  functionType?: boolean;
  initialValue?: DataTypeName;
  immutable?: boolean;
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

// resolves which data types appear in the dropdown. If the level designer set
// no flags at all, default to number/string/boolean; otherwise show exactly
// the types whose flag is truthy.
function resolveEnabledTypes(props: IODataTypeNodeProps): DataTypeName[] {
  const flags: Record<DataTypeName, boolean | undefined> = {
    undefined: props.undefinedType,
    object: props.objectType,
    boolean: props.booleanType,
    number: props.numberType,
    bigint: props.bigintType,
    string: props.stringType,
    symbol: props.symbolType,
    function: props.functionType
  };
  const noneProvided = DATA_TYPE_NAMES.every(
    (type) => flags[type] === undefined
  );
  if (noneProvided) return ["number", "string", "boolean"];
  return DATA_TYPE_NAMES.filter((type) => flags[type] ?? false);
}

/**
 * Built-in processing node: tests the runtime type of a single input via the
 * `typeof` operator, output bound to `output`. Code is empty until the player
 * picks a data type from the dropdown in the entityCode modal. Level designers
 * pick which data types are available via the boolean prop flags; if none are
 * set, the dropdown defaults to `number`, `string`, and `boolean`. A locked
 * node (`immutable`) shows the preset type as a disabled dropdown.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IODataTypeNode
  extends CoreEntity
  implements EntityCodeInjectionAPI
{
  static type = "IODataTypeNode";
  public type = IODataTypeNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  private dataType?: DataTypeName;
  private readonly enabledTypes: DataTypeName[];
  private readonly immutable: boolean;

  constructor(props: IODataTypeNodeProps) {
    super(props);

    this.enabledTypes = resolveEnabledTypes(props);
    this.immutable = props.immutable ?? false;
    if (isDataTypeName(props.initialValue)) {
      this.dataType = props.initialValue;
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
        // code is generated from the picked type, never hand-edited
        immutable: true,
        displayText: (result) => {
          const label = this.dataType ? `is ${this.dataType}?` : "type?";
          if (!result) return { lines: [label] };
          return {
            lines: [label, String(deriveSingleOutput(result.outputs) ?? "")]
          };
        },
        promptString:
          props.promptString ??
          (this.immutable
            ? `Data type node locked to \`${this.dataType ?? "?"}\`. Outputs ` +
              `true when the input is a ${this.dataType ?? "matching"} value, ` +
              "false otherwise."
            : "Data type node. Pick a type; outputs true when the input is that " +
              "type, false otherwise."),
        titleString: props.titleString,
        modalArgs: () => ({
          titleKey: "modals.entityCode.titleWithDataType",
          valueEditor: {
            kind: "choices",
            label: "Data Type",
            value: this.dataType,
            locked: this.immutable,
            choices: this.dropdownTypes().map((type) => ({
              value: type,
              label: type
            }))
          }
        })
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);

    // seed code so a preset type evaluates before any modal interaction
    if (this.dataType) {
      this.behaviors.processor.setCode(buildCode(this.dataType));
      this.behaviors.processor.queueProcessing();
    }
  }

  // always offer the current type, even if its flag isn't enabled
  private dropdownTypes(): DataTypeName[] {
    if (this.dataType && !this.enabledTypes.includes(this.dataType)) {
      return [this.dataType, ...this.enabledTypes];
    }
    return this.enabledTypes;
  }

  acceptPromptResult(result: string) {
    if (!isDataTypeName(result)) return;
    this.setDataType(result);
  }

  private setDataType(type: DataTypeName) {
    if (this.immutable) return;
    if (type === this.dataType) return;
    this.dataType = type;
    this.behaviors.processor.setCode(buildCode(type));
    this.behaviors.processor.queueProcessing();
    this.behaviors.processor.updateOpenModal();
  }
}
