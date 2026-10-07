import { Object3D, Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addFlag,
  getAsset,
  setAssetDependencies
} from "src/engine/entity/decorators";

import { MotionPathProviderBehavior } from "../shared/behaviors/MotionPath";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";
import { TexturedPolylineBehavior } from "../shared/behaviors/TexturedPolyline";

export type MotionPathProps = EntityProps & {
  pathVisible?: boolean;
};

@addFlag("requireShape")
@setAssetDependencies(() => ["motionPathTrack"])
export class MotionPath extends CoreEntity {
  static type = "MotionPath";
  static matchAdditionalTypes = ["MovingTerrainPath"];
  public type = "MotionPath";
  public object3D = new Object3D();
  public behaviors: {
    motionPath: MotionPathProviderBehavior;
    signal: SignalConnectionBehavior;
    texturedPolyline?: TexturedPolylineBehavior;
  } = {
    motionPath: new MotionPathProviderBehavior(),
    signal: new SignalConnectionBehavior()
  };
  constructor(props: MotionPathProps) {
    super(props);
    this.behaviors.motionPath.init(this);
    if (props.polyline || props.polygon) {
      const path = props.polyline ?? props.polygon ?? [];
      if (props.angle) {
        const origin = new Vector2();
        for (const vect of path) {
          vect.rotateAround(origin, props.angle);
        }
      }
      this.behaviors.motionPath.setPath(path, !!props.polygon);
      if (props.pathVisible) {
        this.behaviors.texturedPolyline = new TexturedPolylineBehavior({
          polyline: props.polyline,
          polygon: props.polygon,
          texture: getAsset("motionPathTrack"),
          textureAspectRatio: 2
        });
        this.behaviors.texturedPolyline.init(this);
      }
      this.behaviors.signal.setShape({
        type: "polyline",
        closed: !!props.polygon,
        vertices: props.polygon ?? props.polyline ?? []
      });
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.signal.init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value !== undefined) {
          this.behaviors.motionPath.events.emit(
            "setMotionEnabled",
            !!signal.value
          );
        }
      }
    );
  }
}
