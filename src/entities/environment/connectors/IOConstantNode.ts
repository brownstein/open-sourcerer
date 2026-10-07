import { Object3D } from "three";

import {
  PrimitiveData,
  PrimitiveTypeName,
  coercePrimitive,
  resolvePrimitive
} from "src/api/data";
import {
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
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
  SignalProcessorBehavior,
  deriveOutputMap,
  deriveSingleOutput
} from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";
import { InteractionBehavior } from "../behaviors/InteractionBehavior";

export type IOConstantNodeProps = EntityProps & {
  /** Value emitted on load. Type follows `initialDataType`, else inferred. */
  initialValue?: SignalData;
  /** Forces the emitted type; inferred from the value when omitted. */
  initialDataType?: PrimitiveTypeName;
  /** When false, the player can edit the code and re-emit. Defaults to true. */
  immutable?: boolean;
  promptString?: string;
  titleString?: string;
  canInteract?: boolean;
};

/**
 * Producer node: no inputs, one output, emits a constant on load. Immutable by
 * default; with `immutable: false` the player can edit the code and re-emit.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOConstantNode
  extends CoreEntity
  implements EntityCodeInjectionAPI
{
  static type = "IOConstantNode";
  public type = IOConstantNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    interaction: InteractionBehavior;
    processor: SignalProcessorBehavior;
  };

  private dataType?: PrimitiveTypeName;
  private data?: PrimitiveData;
  private readonly immutable: boolean;

  constructor(props: IOConstantNodeProps) {
    super(props);

    this.dataType = props.initialDataType ?? this.dataType;
    this.data = this.dataType
      ? coercePrimitive(this.dataType, props.initialValue ?? "")
      : undefined;

    if (!this.size.width || !this.size.height) {
      this.size = { width: 1, height: 1 };
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    const immutable = props.immutable ?? true;
    this.immutable = immutable;

    // Editable nodes open with a placeholder hint to fill in.
    const initialValue = immutable
      ? props.initialValue
      : props.initialValue ?? "Output any value here";
    const resolvedInitial = resolvePrimitive(
      initialValue,
      props.initialDataType
    );
    const literal = JSON.stringify(resolvedInitial);
    // typed mode emits this.data; code mode runs the editable code
    const typed = this.dataType !== undefined;

    this.behaviors = {
      // the node's connection is the logical node-assembly channel; values
      // arrive through terminals, never from wires directly
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      interaction: new InteractionBehavior(),
      processor: new SignalProcessorBehavior({
        canInteract: props.canInteract ?? true,
        immutable,
        defaultCode: `output = ${literal};`,
        frameColor: "#f7e81a",
        modalArgs: () => ({
          titleKey: "modals.entityCode.titleWithConstant",
          valueEditor: this.dataType
            ? {
                kind: this.dataType,
                label: "Value",
                value: this.data,
                locked: immutable
              }
            : undefined
        }),
        promptString:
          props.promptString ??
          (immutable
            ? "Constant node. Outputs a constant value to every connected output."
            : "Constant node. Outputs a constant value. Edit the code and apply to emit an updated value."),
        titleString: props.titleString,
        displayText: (result) => {
          const value = typed
            ? this.data
            : result
              ? deriveSingleOutput(result.outputs)
              : resolvedInitial;
          return { lines: [String(value ?? "")], color: "#f7e81a" };
        },
        // NOTE: code mode leaves process undefined so edits actually re-emit
        process: typed ? () => deriveOutputMap(this.data) : undefined
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.interaction.init(this);
    this.behaviors.processor.init(this);

    // Emit on first step, not PreloadComplete: by then terminals have linked
    // and the spell runtime can resolve this entity as a caster.
    this.events.once(EntityLifecycleEvents.Step, () => {
      this.behaviors.processor.queueProcessing();
    });
  }

  /** Applies edited code and re-emits. No-op while immutable. */
  acceptCode(code: string) {
    if (this.immutable || this.dataType !== undefined) return;
    this.behaviors.processor.acceptCode(code);
    this.behaviors.processor.queueProcessing();
  }

  acceptPromptResult(result: string) {
    if (this.immutable || this.dataType === undefined) return;
    this.data = coercePrimitive(this.dataType, result);
    this.behaviors.processor.queueProcessing();
  }
}
