import { Box2, Vector2 } from "three";

import { CameraProperties, CameraRequest } from "src/api/camera";
import { EntityLevelAPI, EntityProps, LevelAPI } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";

import {
  AreaSensorBehavior,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";
import {
  CameraRequestTiledProps,
  buildAdjustmentCameraRequest,
  buildCameraProperties
} from "./cameraRequestProps";

type CameraZonePreset = "static" | "bounds";

export type CameraZoneProps = EntityProps &
  CameraRequestTiledProps & {
    preset?: CameraZonePreset;
    autoActivate?: boolean;
    connectToWires?: boolean;

    // sensor padding
    enablePaddingLeft?: number;
    enablePaddingRight?: number;
    enablePaddingTop?: number;
    enablePaddingBottom?: number;
    disablePaddingLeft?: number;
    disablePaddingRight?: number;
    disablePaddingTop?: number;
    disablePaddingBottom?: number;
  };

export class CameraZone extends CoreEntity {
  static type = "CameraZone";
  public type = "CameraZone";

  public behaviors: {
    enableSensor?: AreaSensorBehavior;
    disableSensor?: AreaSensorBehavior;
    signal: SignalConnectionBehavior;
  };

  private readonly cameraRequest: CameraRequest;
  private readonly targetInfluence: number;
  private readonly transitionDuration: number;
  private readonly transitionSmoothing: number;

  private enabled = false;

  constructor(props: CameraZoneProps) {
    super(props);

    this.targetInfluence = props.influence ?? 1;
    this.transitionDuration = props.transitionDuration ?? 500;
    this.transitionSmoothing = props.transitionSmoothing ?? 1;

    // preset auto-fill properties apply before explicit ones
    const presetProperties: Partial<CameraProperties> = {};
    switch (props.preset) {
      case "static": {
        presetProperties.center = new Vector2(this.position.x, this.position.y);
        presetProperties.size = new Vector2(this.size.width, this.size.height);

        break;
      }
      case "bounds": {
        const halfW = this.size.width / 2;
        const halfH = this.size.height / 2;

        presetProperties.bounds = new Box2(
          new Vector2(this.position.x - halfW, this.position.y - halfH),
          new Vector2(this.position.x + halfW, this.position.y + halfH)
        );

        break;
      }
    }

    this.cameraRequest = buildAdjustmentCameraRequest(
      this.id + "-camera-zone",
      props,
      buildCameraProperties(props, presetProperties)
    );

    // Logical-only unless opted in, so stray wires can never attach to the
    // large invisible rect a camera zone occupies.
    const connectToWires = props.connectToWires ?? false;
    this.behaviors = {
      signal: new SignalConnectionBehavior({ autoProximity: connectToWires })
    };
    if (connectToWires) {
      this.behaviors.signal.setShape({
        type: "aabb",
        width: this.size.width,
        height: this.size.height,
        angle: this.angle
      });
    }
    this.behaviors.signal.init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) this.enable();
        else this.disable();
      }
    );

    // Set up sensors for auto-activation
    const autoActivate = props.autoActivate ?? true;
    if (autoActivate) {
      const enablePaddingLeft = props.enablePaddingLeft ?? 0;
      const enablePaddingRight = props.enablePaddingRight ?? 0;
      const enablePaddingTop = props.enablePaddingTop ?? 0;
      const enablePaddingBottom = props.enablePaddingBottom ?? 0;

      const disablePaddingLeft = props.disablePaddingLeft ?? enablePaddingLeft;
      const disablePaddingRight =
        props.disablePaddingRight ?? enablePaddingRight;
      const disablePaddingTop = props.disablePaddingTop ?? enablePaddingTop;
      const disablePaddingBottom =
        props.disablePaddingBottom ?? enablePaddingBottom;

      this.behaviors.enableSensor = new AreaSensorBehavior({
        paddingLeft: enablePaddingLeft,
        paddingRight: enablePaddingRight,
        paddingTop: enablePaddingTop,
        paddingBottom: enablePaddingBottom
      });
      this.behaviors.enableSensor.init(this);

      this.behaviors.disableSensor = new AreaSensorBehavior({
        paddingLeft: disablePaddingLeft,
        paddingRight: disablePaddingRight,
        paddingTop: disablePaddingTop,
        paddingBottom: disablePaddingBottom
      });
      this.behaviors.disableSensor.init(this);

      this.behaviors.enableSensor.events.on(
        AreaSensorEvents.EntityContact,
        (entity) => {
          if (isPlayerAPI(entity)) this.enable();
        }
      );

      this.behaviors.disableSensor.events.on(
        AreaSensorEvents.EntityContactEnd,
        (entity) => {
          if (isPlayerAPI(entity)) this.disable();
        }
      );
    }
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    level.cameraDirector.sendRequest(this.cameraRequest);
  }

  /**
   * Resolves once the camera has finished transitioning in. A transition
   * superseded mid-lerp never resolves, so it never emits either.
   */
  async enable(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;

    await this.level?.cameraDirector.lerpRequestInfluence(
      this.cameraRequest,
      this.targetInfluence,
      this.transitionDuration,
      this.transitionSmoothing
    );

    this.transmitTransitionComplete(true);
  }

  /** Resolves once the camera has finished transitioning out. */
  async disable(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;

    await this.level?.cameraDirector.lerpRequestInfluence(
      this.cameraRequest,
      0,
      this.transitionDuration,
      this.transitionSmoothing
    );

    this.transmitTransitionComplete(false);
  }

  private transmitTransitionComplete(value: boolean): void {
    // A zone torn down mid-transition has no business emitting afterwards.
    if (!this.level) return;
    this.behaviors.signal.transmit({ value });
  }

  detachFromLevel(level: LevelAPI): void {
    if (this.enabled) {
      this.enabled = false;
      level.cameraDirector.removeRequests(this.cameraRequest);
    }
    super.detachFromLevel(level);
  }

  destroy(): void {
    if (this.enabled && this.level) {
      this.enabled = false;
      this.level.cameraDirector.removeRequests(this.cameraRequest);
    }
    super.destroy();
  }
}
