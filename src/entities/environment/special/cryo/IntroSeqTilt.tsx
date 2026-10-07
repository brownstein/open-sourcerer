import cx from "classnames";
import { useEffect, useState } from "react";
import { Vector2 } from "three";

import { CameraRequest, CameraRequestPriority } from "src/api/camera";
import { EntityLevelAPI, EntityProps } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition
} from "src/api/overlay";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector3To2 } from "src/engine/util/vecTypes";

import "./IntroSeqTilt.less";

type IntroSeqTiltComponentProps = {
  goAwayEmitter: TypedEventEmitter<{ disappear: void }>;
};

function IntroSeqTiltComponent(
  props: OverlayComponentProps<IntroSeqTiltComponentProps>
) {
  const { overlayProps } = props;
  const { goAwayEmitter } = overlayProps ?? {};

  const [disappearing, setDisappearing] = useState(false);

  useEffect(() => {
    const goAway = () => setDisappearing(true);
    goAwayEmitter?.on("disappear", goAway);
    return () => goAwayEmitter?.off("disappear", goAway);
  }, [goAwayEmitter]);

  return (
    <div
      className={cx("intro-sequence-overlay", disappearing && "disappearing")}
    >
      <div className="logo-and-title">
        <div className="game-logo" />
        <h1>Open Sourcerer</h1>
      </div>
    </div>
  );
}

type IntroSeqTiltProps = EntityProps;

export class IntroSeqTilt extends CoreEntity {
  static type = "IntroSeqTilt";
  public type = IntroSeqTilt.type;

  public seqEvents = createTypedEventEmitter<{
    panDone: void;
  }>();

  private startPoint = new Vector2();
  private endPoint = new Vector2();

  private overlayEvents = createTypedEventEmitter<{ disappear: void }>();
  private overlay?: OverlayAPI<IntroSeqTiltComponentProps>;

  private startingCameraRequest: CameraRequest<
    "center" | "size" | "distort" | "compositeOpacity" | "influence"
  >;
  private distortCameraRequst: CameraRequest<"distort" | "influence">;
  private endingCameraRequest: CameraRequest<
    "center" | "size" | "compositeOpacity" | "influence"
  >;

  constructor(props: IntroSeqTiltProps) {
    super(props);

    if (props.polyline) {
      this.startPoint = vector3To2(this.position).add(
        props.polyline.at(0) ?? new Vector2()
      );
      this.endPoint = vector3To2(this.position).add(
        props.polyline.at(-1) ?? new Vector2()
      );
    }

    this.startingCameraRequest = {
      id: this.id + "start",
      priority: CameraRequestPriority.SCRIPTED,
      subPriority: 400,
      center: this.startPoint,
      size: new Vector2(16, 16),
      compositeOpacity: 0,
      distort: 0,
      influence: 1
    };

    this.endingCameraRequest = {
      id: this.id + "end",
      priority: CameraRequestPriority.SCRIPTED,
      subPriority: 500,
      center: this.endPoint,
      size: new Vector2(16, 16),
      compositeOpacity: 1,
      influence: 0
    };

    this.distortCameraRequst = {
      id: this.id + "distory",
      priority: CameraRequestPriority.SCRIPTED,
      subPriority: 600,
      distort: 2,
      influence: 1
    };
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    level.cameraDirector.sendRequest(this.startingCameraRequest);
    level.cameraDirector.sendRequest(this.distortCameraRequst);
    level.cameraDirector.sendRequest(this.endingCameraRequest);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);

    if (this.overlay) this.overlay.remove();
    this.overlay = undefined;
  }
  destroy(): void {
    super.destroy();
    if (this.overlay) this.overlay.remove();
    this.overlay = undefined;
  }
  async appear() {
    if (!this.level) return;

    this.scheduler.add({
      duration: 3000,
      invokeFunctionAtStart: () => {
        this.overlay =
          this.level?.ctx?.overlayProvider?.addOverlay<IntroSeqTiltComponentProps>(
            {
              component: IntroSeqTiltComponent,
              position: OverlayPosition.Viewport,
              overlayProps: {
                goAwayEmitter: this.overlayEvents
              }
            }
          );
      },
      invokeFunctionAtComplete: () => {
        this.disappear();
      }
    });

    const panPromise = this.level.cameraDirector.lerpRequestInfluence(
      this.endingCameraRequest,
      1,
      10000,
      1
    );
    const distortPromise = this.level.cameraDirector.lerpRequestInfluence(
      this.distortCameraRequst,
      0,
      5000,
      0
    );

    await Promise.all([panPromise, distortPromise]);

    this.seqEvents.emit("panDone");
    this.level.cameraDirector.removeRequests(
      this.startingCameraRequest,
      this.endingCameraRequest
    );
    this.level?.removeEntity(this.id);
  }
  disappear() {
    this.overlayEvents.emit("disappear");
    this.scheduler.add({
      duration: 2000,
      invokeFunctionAtComplete: () => {
        this.overlay?.remove();
        this.overlay = undefined;
      }
    });
  }
}
