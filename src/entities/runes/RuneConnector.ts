import { Color, Material, Object3D, Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector2To3, vector2ToArr2 } from "src/engine/util/vecTypes";

import { Text } from "../environment/Text";
import { Line2D } from "../shared/graphics/line/Line2D";
import {
  getRuneColor,
  isRuneAPI,
  runeConnectionFlag
} from "./behaviors/RuneBehaviorsShared";
import { RuneConnectivityBehavior } from "./behaviors/RuneConnectivity";
import { RuneValueBehavior, hasValueBehavior } from "./behaviors/RuneValue";

export type RuneConnectorProps = EntityProps & {};

export class RuneConnector extends CoreEntity {
  static type = "RuneConnector";
  public type = "RuneConnector";
  public [runeConnectionFlag] = true as const;
  public object3D = new Object3D();

  public behaviors = {
    connectivity: new RuneConnectivityBehavior().updateConnectors([
      {
        id: "left",
        relativeOrigin: new Vector2(),
        radius: 0.125
      }
    ]),
    value: new RuneValueBehavior()
  };

  private displayColor = new Color(getRuneColor(false, false, false));
  private line2D?: Line2D;

  constructor(props: RuneConnectorProps) {
    super(props);
    this.object3D.position.copy(this.position);

    this.behaviors.connectivity.init(this);

    if (props.polyline) {
      this.line2D = new Line2D(props.polyline.map(vector2ToArr2));
      this.line2D.recolor(this.displayColor);
      this.object3D.add(this.line2D.mesh);
      const polylineFirst = props.polyline.at(0);
      if (polylineFirst) {
        this.behaviors.connectivity.updateConnectors([
          {
            id: "start",
            relativeOrigin: polylineFirst,
            radius: 0.125
          }
        ]);
      }
      const polylineNextToLast = props.polyline.at(-2);
      const polylineLast = props.polyline.at(-1);
      if (polylineLast) {
        let dir = new Vector2(1, 0);
        if (polylineNextToLast)
          dir = polylineLast.clone().sub(polylineNextToLast).normalize();
        this.behaviors.connectivity.updateProjections([
          {
            id: "end",
            relativeOrigin: polylineLast,
            direction: dir,
            distance: 0.5
          }
        ]);
      }
    }

    this.behaviors.connectivity.events.on("connectedBy", (connectedBy) => {
      this.recolor(getRuneColor(false, false));
      if (isRuneAPI(connectedBy)) {
        const currentValue =
          connectedBy.behaviors.sequence.getSequence()?.runResult;
        if (currentValue !== undefined)
          this.onSequenceCompletedRun([true, currentValue]);
        connectedBy.behaviors.sequence.events.on(
          "sequenceCompletedRun",
          this.onSequenceCompletedRun
        );
      } else if (hasValueBehavior(connectedBy)) {
        this.behaviors.value.setValue(
          connectedBy.behaviors.value.getRawValue(),
          !!connectedBy.behaviors.value.error
        );
        connectedBy.behaviors.value.events.on(
          "valueChanged",
          this.onValueUpdate
        );
      }
    });
    this.behaviors.connectivity.events.on(
      "disconnectedBy",
      (disconnectedBy) => {
        this.recolor(getRuneColor(false, false));
        if (isRuneAPI(disconnectedBy)) {
          this.behaviors.value.setValue(undefined);
          disconnectedBy.behaviors.sequence.events.off(
            "sequenceCompletedRun",
            this.onSequenceCompletedRun
          );
        } else if (hasValueBehavior(disconnectedBy)) {
          this.behaviors.value.setValue(undefined);
          disconnectedBy.behaviors.value.events.off(
            "valueChanged",
            this.onValueUpdate
          );
        }
      }
    );
  }
  private onValueUpdate = ([success, value]: [boolean, unknown]) => {
    this.recolor(getRuneColor(value !== undefined, !!value, !success));
    // this.behaviors.value.setValue(value, !success);
    this.beginDelveringValue(value, !success);
  };
  private onSequenceCompletedRun = ([success, value]: [boolean, unknown]) => {
    this.recolor(getRuneColor(value !== undefined, !!value, !success));
    // this.behaviors.value.setValue(value, !success);
    this.beginDelveringValue(value, !success);
  };
  private beginDelveringValue(value: unknown, isError?: boolean) {
    const newColor = new Color(
      getRuneColor(value !== undefined, !!value, isError)
    );
    this.recolor(newColor);
    const displayText = new Text({
      text: isError ? "!" : JSON.stringify(value),
      position: this.position.clone(),
      textFont: "Highbirth",
      textPixelSize: 7,
      textColor:
        "#" +
        newColor
          .clone()
          .lerp(new Color(1, 1, 1), 0.8)
          .getHexString(),
      outline: true,
      outlineColor:
        "#" +
        newColor
          .clone()
          .lerp(new Color(0, 0, 0), 0.8)
          .getHexString()
    });
    this.level?.addEntity(displayText);
    const totalPathLen = this.line2D?.getTotalDistance() ?? 1;
    this.scheduler.add({
      id: "deliverValue",
      duration: totalPathLen * 250,
      invokeFunction: (t) => {
        const pos = this.position.clone();
        const offset2 = this.line2D?.getPathPointAtDistance(t * totalPathLen);
        if (offset2) pos.add(vector2To3(offset2));
        displayText.position.copy(pos);
        displayText.object3D.position.copy(pos);
      },
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(displayText.id);
        this.behaviors.value.setValue(value, isError, true);
      }
    });
  }
  recolor(color: ColorRepresentation, duration = 250) {
    const initialColor = this.displayColor.clone();
    this.scheduler.cancel("recolor");
    this.scheduler.add({
      id: "recolor",
      duration,
      invokeFunction: (t) => {
        this.displayColor.copy(initialColor).lerp(new Color(color), t);
        this.line2D?.recolor(this.displayColor);
      },
      invokeFunctionAtComplete: () => {
        this.displayColor.set(color);
        this.line2D?.recolor(this.displayColor);
      }
    });
  }
  destroy() {
    super.destroy();
    if (this.line2D) {
      this.line2D.mesh.geometry.dispose();
      (this.line2D.mesh.material as Material).dispose();
      this.line2D = undefined;
    }
  }
}

export class RuneConnectionSplitter extends CoreEntity {
  static type = "RuneConnectionSplitter";
  public type = "RuneConnectionSplitter";
  public [runeConnectionFlag] = true as const;
  public behaviors = {
    connectivity: new RuneConnectivityBehavior().updateConnectors([
      {
        id: "left",
        relativeOrigin: new Vector2(),
        radius: 0.125
      }
    ]),
    value: new RuneValueBehavior()
  };
  constructor(props: EntityProps) {
    super(props);

    this.behaviors.connectivity.init(this);
    this.behaviors.connectivity.updateProjections([
      {
        id: "topRight",
        direction: new Vector2(1, 0.5).normalize(),
        relativeOrigin: new Vector2(
          this.size.width * 0.5,
          this.size.height * 0.5
        ),
        distance: 0.5
      },
      {
        id: "bottomRight",
        direction: new Vector2(1, -0.5).normalize(),
        relativeOrigin: new Vector2(
          this.size.width * 0.5,
          -this.size.height * 0.5
        ),
        distance: 0.5
      }
    ]);

    this.behaviors.connectivity.events.on("connectedBy", (connectedBy) => {
      if (isRuneAPI(connectedBy)) {
        this.behaviors.value.setValue(
          connectedBy.behaviors.sequence.getSequence()?.runResult
        );
        connectedBy.behaviors.sequence.events.on(
          "sequenceCompletedRun",
          this.onSequenceCompletedRun
        );
      }
    });
    this.behaviors.connectivity.events.on(
      "disconnectedBy",
      (disconnectedBy) => {
        if (isRuneAPI(disconnectedBy)) {
          this.behaviors.value.setValue(undefined);
          disconnectedBy.behaviors.sequence.events.off(
            "sequenceCompletedRun",
            this.onSequenceCompletedRun
          );
        }
      }
    );
  }
  private onSequenceCompletedRun = ([success, value]: [boolean, unknown]) => {
    this.behaviors.value.setValue(value, !success);
  };
}
