import {
  ProtoSpriteSheetThree,
  ProtoSpriteThreeExtended
} from "protosprite-three";
import { NineSliceRegionID } from "protosprite-three/dist/ProtoSpriteThreeExtended";
import { Color, ColorRepresentation, Vector2, Vector3 } from "three";

import { PrimitiveTypeName } from "src/api/data";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLifecycleEvents
} from "src/api/entity";
import { KnownModalArgTypes, ModalInstanceType } from "src/api/modal";
import {
  Signal,
  SignalConnectionEvents,
  SignalData,
  validateSignalData
} from "src/api/signal";
import { SpellCtx } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { getAsset } from "src/engine/entity/decorators";
import { vector2To3, vector3To2 } from "src/engine/util/vecTypes";
import { TextPixelated } from "src/entities/environment/TextPixelated";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "src/entities/environment/behaviors/InteractionBehavior";
import * as ioNodeTypes from "src/entities/environment/sprites/connectable/ionode";
import { pushModalTyped } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { updateModalInStack } from "src/redux/ui/slice";

import { SignalConnectionBehavior } from "./SignalConnectionBehavior";
import type { TerminalBehavior } from "./TerminalBehavior";

/** Duration of the visible flash on a node after it processes a signal. */
const FLASH_MS = 300;

// Direction configs for the standard node sprite's attachment arrows.
export type DirectionalConfig = {
  vector: Vector2;
  groupName: ioNodeTypes.sprite_layers;
  inArrowName: ioNodeTypes.sprite_layers;
  outArrowName: ioNodeTypes.sprite_layers;
  slidingX?: boolean;
  slidingY?: boolean;
  offsetCorrection?: Vector2;
};

export const directionConfigs: DirectionalConfig[] = [
  {
    vector: new Vector2(1, 1),
    groupName: "top_right_connection",
    inArrowName: "in_arrow_top_right",
    outArrowName: "out_arrow_top_right",
    offsetCorrection: new Vector2(0.18, 0.18)
  },
  {
    vector: new Vector2(0, 1),
    groupName: "top_connection",
    inArrowName: "in_arrow_top",
    outArrowName: "out_arrow_top",
    slidingX: true,
    offsetCorrection: new Vector2(0, 0.2)
  },
  {
    vector: new Vector2(-1, 1),
    groupName: "top_left_connection",
    inArrowName: "in_arrow_top_left",
    outArrowName: "out_arrow_top_left",
    offsetCorrection: new Vector2(-0.18, 0.18)
  },
  {
    vector: new Vector2(-1, 0),
    groupName: "left_connection",
    inArrowName: "in_arrow_left",
    outArrowName: "out_arrow_left",
    slidingY: true,
    offsetCorrection: new Vector2(-0.25, 0)
  },
  {
    vector: new Vector2(1, 0),
    groupName: "right_connection",
    inArrowName: "in_arrow_right",
    outArrowName: "out_arrow_right",
    slidingY: true,
    offsetCorrection: new Vector2(0.2, 0)
  },
  {
    vector: new Vector2(-1, -1),
    groupName: "bottom_left_connection",
    inArrowName: "in_arrow_bottom_left",
    outArrowName: "out_arrow_bottom_left",
    offsetCorrection: new Vector2(-0.18, -0.18)
  },
  {
    vector: new Vector2(0, -1),
    groupName: "bottom_connection",
    inArrowName: "in_arrow_bottom",
    outArrowName: "out_arrow_bottom",
    slidingX: true,
    offsetCorrection: new Vector2(0, -0.2)
  },
  {
    vector: new Vector2(1, -1),
    groupName: "bottom_right_connection",
    inArrowName: "in_arrow_bottom_right",
    outArrowName: "out_arrow_bottom_right",
    offsetCorrection: new Vector2(0.18, -0.18)
  }
];

const autoLabeledSingleVariableName = "input";
const autoLabeledVariableNames = ["a", "b", "c", "d"];
const autoLabeledSingleOutputName = "output";

const DEFAULT_PROMPT =
  "Edit the processor. The incoming signal is bound to the variable `value`; " +
  "the last expression evaluated is sent to every connected output.\n\n" +
  "Example: `value * 2` or `!value`.";

export type SignalProcessorCompatibleEntity = BaseEntityType<{
  signal?: SignalConnectionBehavior;
  interaction?: InteractionBehavior;
}>;

export type SignalInputMeta = {
  name?: string;
  required?: boolean;
  defaultValue?: SignalData;
  variableType?: PrimitiveTypeName;
};

export type SignalOutputMeta = {
  name?: string;
};

export type AttachmentSlotInfo = {
  position: Vector3;
  direction: Vector2;
  sliding: boolean;
};

type InputRecord = {
  terminal: TerminalBehavior;
  explicitName?: string;
  name?: string;
  required: boolean;
  variableType?: PrimitiveTypeName;
  currentValue?: SignalData;
};

type OutputRecord = {
  terminal: TerminalBehavior;
  explicitName?: string;
  name?: string;
  currentValue?: SignalData;
};

export type CustomTextInput = {
  maxCharacters: [number, number];
  code?: string;
  inputs?: string[];
  outputs?: Map<string, unknown>;
  singleOutput?: unknown;
  errorMessage?: string;
};

export type CustomTextOutput = {
  lines?: string[];
  color?: ColorRepresentation;
};

export type SignalProcessorTextPromptCallback = (
  result?: CustomTextInput
) => CustomTextOutput;

export type SignalProcessorOptions = {
  /** Standard node sprite; reskins follow the same layer/9-slice contract. */
  assetKey?: string;
  defaultCode?: string;
  /** Built-ins are immutable — the modal is read-only and edits are ignored. */
  immutable?: boolean;
  /** Press-E opens the entityCode modal. Requires an `interaction` sibling. */
  canInteract?: boolean;
  promptString?: string;
  titleString?: string;
  /** Color for the signal processing frame. */
  frameColor?: ColorRepresentation;
  /**
   * Default `required` for registered inputs (per-terminal meta still wins).
   * Combinational gates want every input present before emitting; reactive
   * nodes set this false so they process on any single input's arrival.
   */
  requireAllInputs?: boolean;
  process?: (
    inputs: Map<string, SignalData>,
    outputs: Set<string>
  ) => Promise<Map<string, SignalData>> | Map<string, SignalData>;
  displayText?: SignalProcessorTextPromptCallback;
  modalArgs?: () => Partial<KnownModalArgTypes["entityCode"]>;
};

/**
 * THE processor-node behavior: composes the standard node look, terminal
 * hosting, signal processing, and the code modal. A processor node is just an
 * entity with a {@link SignalConnectionBehavior} sibling and this behavior.
 *
 * Terminals register on attach (metadata channel) and exchange values with
 * the node over logical buses (value channel). Each incoming named signal is
 * routed to the matching input port; processing gathers the inputs, runs the
 * node's code in a fresh headless spell context, and emits each output as a
 * named signal that output terminals relay out.
 */
export class SignalProcessorBehavior
  implements EntityBehavior<SignalProcessorCompatibleEntity>
{
  static type = "SignalProcessor";
  public type = SignalProcessorBehavior.type;

  public entity?: SignalProcessorCompatibleEntity;
  public events = createTypedEventEmitter<{
    ioReorganized: {
      inputs: Map<TerminalBehavior, InputRecord>;
      outputs: Map<TerminalBehavior, OutputRecord>;
    };
  }>();

  private assetKey: string;
  private defaultCode?: string;
  private immutable: boolean;
  private requireAllInputs: boolean;
  private canInteract: boolean;
  private promptString: string;
  private titleString?: string;
  private processorFunction?: SignalProcessorOptions["process"];
  private modalArgs?: () => Partial<KnownModalArgTypes["entityCode"]>;
  private processDisplayText?: SignalProcessorTextPromptCallback;
  private userCode?: string;

  private connection?: SignalConnectionBehavior;
  private level?: EntityLevelAPI;

  private sprite?: ProtoSpriteThreeExtended<
    ioNodeTypes.sprite_layers,
    ioNodeTypes.sprite_animations,
    NineSliceRegionID
  >;
  private frameColor: Color;
  private text?: TextPixelated;
  private flashRemaining = 0;
  /** id of the most-recently-launched modal, for {@link updateOpenModal}. */
  private currentModalId?: string;

  private readonly inputs = new Map<TerminalBehavior, InputRecord>();
  private readonly outputs = new Map<TerminalBehavior, OutputRecord>();

  /** Level-scripting hooks fired on every ready processing pass. */
  private readonly processingCallbacks = new Set<
    (inputs: Record<string, SignalData>) => void
  >();

  /** Promise chain that runs signal processing in FIFO order. */
  private processingChain: Promise<void> = Promise.resolve();

  constructor(options?: SignalProcessorOptions) {
    this.assetKey = options?.assetKey ?? "ioNode";
    this.defaultCode = options?.defaultCode;
    this.immutable = options?.immutable ?? false;
    this.requireAllInputs = options?.requireAllInputs ?? true;
    this.canInteract = options?.canInteract ?? false;
    this.promptString = options?.promptString ?? DEFAULT_PROMPT;
    this.titleString = options?.titleString;
    this.frameColor = options?.frameColor
      ? new Color(options.frameColor)
      : new Color(1, 1, 1);
    this.processorFunction = options?.process;
    this.modalArgs = options?.modalArgs;
    this.processDisplayText = options?.displayText;
    this.step = this.step.bind(this);
  }

  init(entity: SignalProcessorCompatibleEntity) {
    this.entity = entity;
    this.connection = entity.behaviors.signal;
    if (!this.connection) {
      throw new Error(
        "SignalProcessorBehavior requires a `signal` SignalConnectionBehavior sibling"
      );
    }

    const sprite = getAsset<ProtoSpriteSheetThree>(
      this.assetKey
    ).getSpriteExtended<
      ioNodeTypes.sprite_layers,
      ioNodeTypes.sprite_animations,
      NineSliceRegionID
    >();
    this.sprite = sprite;
    sprite.hideLayers(
      "node_text",
      ...directionConfigs.map((cfg) => cfg.groupName)
    );
    sprite.nineSlice(new Vector2(58, 82), new Vector2(69, 91));
    sprite.gotoAnimation("connections_lit");
    sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    sprite.autoUpdateRegions(
      entity.size.width * kPixelScale,
      entity.size.height * kPixelScale,
      "stretch"
    );
    sprite.center();
    sprite.multiplyAllLayers(this.frameColor, 0.75);
    entity.object3D?.add(sprite.mesh);

    entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.connection.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => this.acceptSignal(signal)
    );

    if (this.canInteract) {
      const interaction = entity.behaviors.interaction;
      if (!interaction) {
        throw new Error(
          "SignalProcessorBehavior with canInteract requires an `interaction` sibling"
        );
      }
      interaction.events.on(InteractionProviderEvents.SetFocused, (focused) => {
        const intensity = focused ? 1 : 0;
        sprite.outlineLayers(
          intensity,
          new Color(intensity, intensity, intensity),
          1,
          "node_group"
        );
      });
      interaction.events.on(InteractionProviderEvents.Interact, () =>
        this.launchModal()
      );
    } else {
      entity.behaviors.interaction?.disable();
    }

    const displayText = this.processDisplayText?.();
    this.updateDisplayText(
      displayText?.lines ?? "[JS]",
      false,
      false,
      displayText?.color
    );
    return this;
  }

  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
    if (this.text) {
      level.addEntity(this.text);
    }
  }

  detachFromLevel(level: EntityLevelAPI) {
    if (this.text) {
      level.removeEntity(this.text.id);
    }
    this.level = undefined;
  }

  registerInput(terminal: TerminalBehavior, meta?: SignalInputMeta) {
    this.inputs.set(terminal, {
      terminal,
      explicitName: meta?.name,
      name: meta?.name,
      required: meta?.required ?? this.requireAllInputs,
      variableType: meta?.variableType,
      currentValue: meta?.defaultValue
    });
    this.organizeIO();
  }

  registerOutput(terminal: TerminalBehavior, meta?: SignalOutputMeta) {
    this.outputs.set(terminal, {
      terminal,
      explicitName: meta?.name,
      name: meta?.name
    });
    this.organizeIO();
  }

  unregister(terminal: TerminalBehavior) {
    this.inputs.delete(terminal);
    this.outputs.delete(terminal);
  }

  /**
   * Clears an input's stored value so a momentary trigger acts once per
   * arrival instead of latching. Does not re-run processing.
   */
  consumeInput(name: string) {
    for (const input of this.inputs.values()) {
      if (input.name === name) input.currentValue = undefined;
    }
  }

  /** The name a registered terminal's port resolved to (after auto-naming). */
  nameFor(terminal: TerminalBehavior): string | undefined {
    return this.inputs.get(terminal)?.name ?? this.outputs.get(terminal)?.name;
  }

  /**
   * Resolves the dock slot on this node for a terminal at the given world
   * position, reading the dock zones from the sprite's connection-layer
   * bounds. Returns null when the terminal faces no slot.
   */
  getAttachmentSlot(terminalWorldPos: Vector3): AttachmentSlotInfo | null {
    if (!this.entity || !this.sprite) return null;
    const pos2 = vector3To2(this.entity.position);
    const input2 = vector3To2(terminalWorldPos);
    const input2Relative = input2.clone().sub(pos2);
    let outputRelative = input2Relative;
    let outputDistance = Infinity;
    let outputVector: Vector2 | undefined;
    let outputSliding = false;
    for (const cfg of directionConfigs) {
      const dotRaw = input2Relative.dot(cfg.vector);
      if (dotRaw <= 0) continue;
      const groupBounds = this.sprite.getLayerBounds(cfg.groupName);
      groupBounds.min
        .add(this.sprite.centerOffset)
        .multiplyScalar(kInvPixelScale);
      groupBounds.max
        .add(this.sprite.centerOffset)
        .multiplyScalar(kInvPixelScale);
      [groupBounds.min.y, groupBounds.max.y] = [
        groupBounds.max.y * -1,
        groupBounds.min.y * -1
      ];
      const proposedOutputRelative = new Vector2();
      groupBounds.getCenter(proposedOutputRelative);
      const slidePadding = 0.16;
      if (cfg.slidingX) {
        if (input2Relative.x > 0) {
          proposedOutputRelative.x = Math.min(
            groupBounds.max.x - slidePadding,
            input2Relative.x
          );
        } else {
          proposedOutputRelative.x = Math.max(
            groupBounds.min.x + slidePadding,
            input2Relative.x
          );
        }
      }
      if (cfg.slidingY) {
        if (input2Relative.y > 0) {
          proposedOutputRelative.y = Math.min(
            groupBounds.max.y - slidePadding,
            input2Relative.y
          );
        } else {
          proposedOutputRelative.y = Math.max(
            groupBounds.min.y + slidePadding,
            input2Relative.y
          );
        }
      }
      const proposedOutputDistance = proposedOutputRelative
        .clone()
        .sub(input2Relative)
        .length();
      if (proposedOutputDistance < outputDistance) {
        outputRelative = proposedOutputRelative;
        outputDistance = proposedOutputDistance;
        outputVector = cfg.vector;
        outputSliding = !!(cfg.slidingX || cfg.slidingY);
      }
    }
    if (!outputVector) return null;
    const position = vector2To3(outputRelative).add(this.entity.position);
    return { position, direction: outputVector, sliding: outputSliding };
  }

  /** Implements the entityCode modal contract: receives code from the modal. */
  acceptCode(code: string) {
    if (this.immutable) return;
    this.userCode = code;
  }

  /**
   * Programmatic code update for the owning entity (e.g. an operator pick).
   * Unlike `acceptCode`, this bypasses `immutable` — that flag guards the
   * player's modal edits, not the entity's own state changes.
   */
  setCode(code: string) {
    this.userCode = code;
  }

  setDefaultCode(code: string) {
    this.defaultCode = code;
  }

  /**
   * Attaches a level-scripting hook that runs whenever the node processes —
   * i.e. once all *required* inputs are supplied, and again on any subsequent
   * input change. The callback receives a snapshot record of input name ->
   * value at that processing pass. Fires independently of whether the node has
   * code, so a callback-only node (no code) still drives custom logic.
   * @returns an unsubscribe function that removes the callback.
   */
  attachProcessingCallback(
    callback: (inputs: Record<string, SignalData>) => void
  ): () => void {
    this.processingCallbacks.add(callback);
    return () => {
      this.processingCallbacks.delete(callback);
    };
  }

  // automatically assign port names to registered terminals lacking one;
  // auto-assigned names are re-derived on each run so the naming scheme
  // matches the full terminal set, not registration order
  private organizeIO() {
    for (const input of this.inputs.values()) input.name = input.explicitName;
    for (const output of this.outputs.values())
      output.name = output.explicitName;
    if (this.inputs.size > 1) {
      const usedSymbols = new Set<string>();
      const sortedInputs = [...this.inputs.values()];
      sortedInputs.sort(
        (a, b) =>
          b.terminal.position.y -
          b.terminal.position.x -
          (a.terminal.position.y + a.terminal.position.x)
      );
      for (const input of sortedInputs) {
        if (input.name === undefined) {
          const nextAvailable = autoLabeledVariableNames.find(
            (v) => !usedSymbols.has(v)
          );
          if (!nextAvailable) continue;
          input.name = nextAvailable;
        }
        usedSymbols.add(input.name);
      }
    } else {
      for (const input of this.inputs.values()) {
        if (input.name === undefined)
          input.name = autoLabeledSingleVariableName;
      }
    }
    for (const output of this.outputs.values()) {
      if (output.name === undefined) {
        output.name = autoLabeledSingleOutputName;
      }
    }
    this.events.emit("ioReorganized", {
      inputs: this.inputs,
      outputs: this.outputs
    });
  }

  private acceptSignal(signal: Signal) {
    for (const input of this.inputs.values()) {
      if (input.name === signal.name) {
        input.currentValue = signal.value;
      }
    }
    this.queueProcessing();
  }

  queueProcessing() {
    this.processingChain = this.processingChain
      .then(() => this.doProcessing())
      .catch((err) => {
        console.warn("[SignalProcessor] signal handling failed:", err);
      });
  }

  private async doProcessing() {
    this.organizeIO();

    this.flashRemaining = FLASH_MS;

    const inputValues = new Map<string, SignalData>();
    const outputVariables = new Set<string>();
    for (const input of this.inputs.values()) {
      if (input.name === undefined) continue;
      if (input.currentValue === undefined && input.required) return;
      inputValues.set(input.name, input.currentValue ?? null);
    }
    for (const output of this.outputs.values()) {
      if (output.name === undefined) continue;
      outputVariables.add(output.name);
    }

    // Readiness gate has passed: all required inputs are present and
    // `inputValues` is fully built. Fire level-scripting hooks before running
    // the node's code so they run on every ready pass regardless of code
    // execution or errors.
    if (this.processingCallbacks.size > 0) {
      const inputSnapshot: Record<string, SignalData> = {};
      for (const [name, value] of inputValues) inputSnapshot[name] = value;
      for (const callback of this.processingCallbacks) {
        try {
          callback(inputSnapshot);
        } catch (err) {
          console.warn("[SignalProcessor] processing callback failed:", err);
        }
      }
    }

    const [outputValues, outputIsError] = await this.process(
      inputValues,
      outputVariables
    );
    let isValue = false;
    let singleOutput: SignalData = "[Done]";
    if (outputIsError) singleOutput = "Error";
    if (outputValues.size === 1) {
      isValue = true;
      singleOutput = outputValues.values().next().value ?? singleOutput;
    }
    const processedDisplayText = this.processDisplayText?.({
      maxCharacters: this.text?.maxCharacters() ?? [5, 2],
      code: this.userCode ?? this.defaultCode,
      inputs: [...this.inputs.values()]
        .map((v) => v.name)
        .filter((s): s is string => !!s),
      outputs: outputValues,
      singleOutput
    });
    this.updateDisplayText(
      processedDisplayText?.lines ?? singleOutput,
      !processedDisplayText && isValue,
      outputIsError,
      processedDisplayText?.color
    );
    if (outputIsError) return;
    for (const name of outputVariables) {
      const outputValue = outputValues.get(name);
      for (const output of this.outputs.values()) {
        if (output.name === name) output.currentValue = outputValue;
      }
      if (outputValue !== undefined) {
        this.connection?.transmit({ value: outputValue, name });
      }
    }
  }

  /**
   * Computes the output values for the given inputs by running the node's
   * code in a fresh, headless spell context: binds the inputs (and nulled
   * outputs) via `setVars`, runs, reads back the named outputs, and preserves
   * the single-primitive last-expression result as `output` when the node has
   * no named outputs. The context is torn down before this returns, so each
   * evaluation starts from a clean slate.
   */
  private async process(
    inputVariables: Map<string, SignalData>,
    outputVariables: Set<string>
  ): Promise<[Map<string, SignalData>, boolean]> {
    if (this.processorFunction) {
      const processorValue = await this.processorFunction(
        inputVariables,
        outputVariables
      );
      return [processorValue, false];
    }

    const output = new Map<string, SignalData>();
    const code = this.userCode ?? this.defaultCode;
    if (!code) return [output, false];
    const spells = this.level?.ctx?.spells;
    if (!spells || !this.entity) return [output, true];

    let ctx: SpellCtx | undefined;
    try {
      ctx = await spells.run("", this.entity.id);
      ctx.setHeadless(true);
      const incomingVars: Record<string, SignalData> = {};
      for (const [k, v] of inputVariables) incomingVars[k] = v;
      for (const k of outputVariables) incomingVars[k] = null;
      ctx.setVars(incomingVars);
      ctx.setHeadless(true);
      ctx.appendAndRun(code);
      const result = await ctx.runCompletePromise();
      if (ctx.error) {
        console.warn("[SignalProcessor] spell error:", ctx.error.message);
        ctx.destroy();
        return [output, true];
      }
      validateSignalData(result);
      if (
        typeof result === "boolean" ||
        typeof result === "number" ||
        typeof result === "string"
      ) {
        if (outputVariables.size === 0) {
          output.set(autoLabeledSingleOutputName, result);
        }
      }
      const outputValues = await ctx.getVars([...outputVariables]);
      for (const [k, v] of Object.entries(outputValues)) {
        // This type cast is a potential kludge.
        validateSignalData(v);
        output.set(k, v as SignalData);
      }
      return [output, false];
    } catch (err) {
      console.warn("[SignalProcessor] failed to run processor spell:", err);
      return [output, true];
    } finally {
      if (ctx) {
        if (ctx.running) ctx.terminate();
        ctx.destroy();
      }
    }
  }

  private updateDisplayText(
    value: SignalData,
    isValue = true,
    isError = false,
    specifiyColor?: ColorRepresentation
  ) {
    if (!this.entity) return;
    const displayText = isValue
      ? JSON.stringify(value)
      : Array.isArray(value)
        ? value.map(String)
        : String(value);
    const color = specifiyColor
      ? `#${new Color(specifiyColor).getHexString()}`
      : isError
        ? "#ff6666"
        : "#22aaff";

    if (this.text) {
      this.text.update({
        text: displayText,
        color,
        // NOTE: errors stay on one line — they shrink and ellipsize instead
        shouldWrap: !isError
      });
    } else {
      const textPosition = this.entity.position.clone();
      textPosition.z += 0.1;
      this.text = new TextPixelated({
        position: textPosition,
        layerName: this.entity.layerName,
        size: {
          width: this.entity.size.width - 0.55,
          height: this.entity.size.height - 0.55
        },
        text: displayText,
        scale: 1,
        color,
        outline: true,
        outlineColor: "#222222",
        fontSize: 12,
        font: "directMessage",
        shouldWrap: !isError,
        overflow: "truncate",
        autoShrinkFontSize: true,
        autoShrinkFontSizeMin: 6,
        autoShrinkFontSizeIncrement: 6
      });
      this.level?.addEntity(this.text);
    }
  }

  private buildModalConfig() {
    this.organizeIO();

    const sortedInputs = [...this.inputs.values()]
      .map((i) => i.name)
      .filter((v): v is string => !!v);
    sortedInputs.sort((a, b) => a.localeCompare(b) ?? 0);
    const sortedOutputs = [
      ...new Set(
        [...this.outputs.values()]
          .map((o) => o.name)
          .filter((v): v is string => !!v)
      ).values()
    ];
    sortedOutputs.sort((a, b) => a.localeCompare(b) ?? 0);

    return {
      modalName: "entityCode" as const,
      modalArg: {
        ...this.modalArgs?.(),
        entityId: this.entity?.id ?? "",
        currentCode: this.userCode ?? this.defaultCode,
        presetCode: this.defaultCode,
        promptString: this.promptString,
        titleString: this.titleString,
        inputVariables: sortedInputs,
        outputVariables: sortedOutputs,
        immutable: this.immutable
      }
    };
  }

  private launchModal() {
    if (!this.level || !this.entity) return;
    const action = store.dispatch(pushModalTyped(this.buildModalConfig()));
    this.currentModalId = action.payload.id;
  }

  /**
   * If the modal launched by this behavior is still open, re-dispatches its
   * args from current state. Use after mutating code or prompt-affecting
   * entity state so the open modal reflects the change. Merges over the
   * in-stack args so fields the modal component added (e.g. its `editorId`)
   * survive; a stale id simply no-ops.
   */
  updateOpenModal() {
    if (!this.currentModalId) return;
    const existing = store
      .getState()
      .ui.modalStack?.find((modal) => modal.id === this.currentModalId);
    if (!existing || existing.modalName !== "entityCode") return;
    const config = this.buildModalConfig();
    store.dispatch(
      updateModalInStack({
        ...existing,
        modalArg: {
          ...(existing as ModalInstanceType<"entityCode">).modalArg,
          ...config.modalArg
        }
      })
    );
  }

  step(ms: number) {
    this.sprite?.advance(ms);
    if (this.entity?.object3D) {
      this.entity.object3D.rotation.z = this.entity.angle;
    }
    if (this.flashRemaining > 0) {
      this.flashRemaining = Math.max(0, this.flashRemaining - ms);
    }
  }

  destroy() {
    this.entity?.events.off(EntityLifecycleEvents.Step, this.step);
    if (this.text && this.level) {
      this.level.removeEntity(this.text.id);
      this.text.destroy();
      this.text = undefined;
    }
    this.sprite?.dispose();
  }

  getFrameColor() {
    return this.frameColor;
  }
}

/**
 * Finds a {@link SignalProcessorBehavior} on an entity regardless of which
 * key it is registered under in the entity's `behaviors` map.
 */
export function findSignalProcessorBehavior(
  entity: BaseEntityType
): SignalProcessorBehavior | undefined {
  for (const behavior of Object.values(entity.behaviors)) {
    if ((behavior as EntityBehavior)?.type === SignalProcessorBehavior.type) {
      return behavior as SignalProcessorBehavior;
    }
  }
  return undefined;
}

export function deriveOutputMap(value: SignalData) {
  const map = new Map<string, SignalData>();
  map.set(autoLabeledSingleOutputName, value);
  return map;
}

/** Maps `value` onto every provided output name (empty names → empty map). */
export function deriveOutputsFor(
  value: SignalData,
  names: Iterable<string>
): Map<string, SignalData> {
  const map = new Map<string, SignalData>();
  for (const name of names) map.set(name, value);
  return map;
}

export function deriveSingleOutput(values?: Map<string, unknown>) {
  if (!values) return null;
  return values.get(autoLabeledSingleOutputName) ?? null;
}
