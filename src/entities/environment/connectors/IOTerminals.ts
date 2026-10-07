import { Object3D } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { PrimitiveTypeName } from "src/entities/metadata/metadataTypes";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import { TerminalBehavior } from "src/entities/shared/behaviors/TerminalBehavior";

import { TextPixelated } from "../TextPixelated";

export type IOInputProps = EntityProps & {
  variableName?: string;
  variableType?: PrimitiveTypeName;
  defaultValue?: SignalData;
  valueRequiredForProcessing?: boolean;
};

/**
 * Wire terminal that receives signals from any tapped wire and forwards them
 * to its attached processor node, remapped to the registered input name.
 * Renders the forward-pointing arrow rotated to face the node it bound to.
 */
@setAssetDependencies(() => ["ioNode"])
export class IOInput extends CoreEntity {
  static type = "IOInput";
  public type = IOInput.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    terminal: TerminalBehavior;
  };

  private text?: TextPixelated;

  constructor(props: IOInputProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors = {
      signal: new SignalConnectionBehavior(),
      terminal: new TerminalBehavior("input", {
        name: props.variableName,
        variableType: props.variableType,
        defaultValue: props.defaultValue,
        required: props.valueRequiredForProcessing
      })
    };
    this.behaviors.terminal.events.on("relabeled", (label) => {
      this.updateText(label);
    });
    this.behaviors.signal.init(this);
    this.behaviors.terminal.init(this);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    if (this.text) this.level?.removeEntity(this.text.id);
    this.text = undefined;
  }

  private updateText(str: string) {
    if (this.text) {
      this.text.update({
        text: str
      });
      this.text.position.copy(this.position);
      this.text.object3D.position.copy(this.position);
      this.text.position.z += 0.25;
      this.text.object3D.position.z += 0.25;
      if (!this.level?.getEntity(this.text.id)) {
        this.level?.addEntity(this.text);
      }
    } else {
      const position = this.position.clone();
      position.z += 0.25;
      this.text = new TextPixelated({
        position,
        layerName: this.layerName,
        size: {
          width: 0.5,
          height: 0.5
        },
        horizontalAlign: "center",
        verticalAlign: "center",
        color: "#fff",
        text: str,
        font: "directMessage",
        fontSize: 6,
        scale: 1,
        shouldWrap: false,
        overflow: "visible"
      });
      this.level?.addEntity(this.text);
    }
  }
}

export type IOOutputProps = EntityProps & {
  variableName?: string;
};

/**
 * Wire terminal driven by an attached processor node. When the node emits a
 * signal named like this terminal's output, it is transmitted onto every wire
 * this output taps. Renders the arrow rotated to face away from the node.
 */
@setAssetDependencies(() => ["ioNode"])
export class IOOutput extends CoreEntity {
  static type = "IOOutput";
  public type = IOOutput.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    terminal: TerminalBehavior;
  };

  constructor(props: IOOutputProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors = {
      signal: new SignalConnectionBehavior(),
      terminal: new TerminalBehavior("output", {
        name: props.variableName
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.terminal.init(this);
  }
}
