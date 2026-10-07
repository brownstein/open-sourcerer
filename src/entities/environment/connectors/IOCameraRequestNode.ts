import { Object3D } from "three";

import { CameraRequest } from "src/api/camera";
import {
  EntityAlignment,
  EntityLevelAPI,
  EntityProps,
  LevelAPI
} from "src/api/entity";
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
  deriveOutputsFor
} from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";
import {
  CameraRequestTiledProps,
  buildAdjustmentCameraRequest,
  buildCameraProperties
} from "../cameraRequestProps";

export type IOCameraRequestNodeProps = EntityProps & CameraRequestTiledProps;

/**
 * Built-in camera request: sends a CameraZone-style adjustment request whose
 * influence is driven by the signal graph instead of an area sensor — for
 * camera effects that don't depend on where the player is standing
 * (letterboxing, shake, offset, ...). A truthy input lerps the request in, a
 * falsy input lerps it out, and the completed transition emits true/false so
 * sequences can wait on it.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOCameraRequestNode extends CoreEntity {
  static type = "IOCameraRequestNode";
  public type = IOCameraRequestNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly cameraRequest: CameraRequest;
  private readonly targetInfluence: number;
  private readonly transitionDuration: number;
  private readonly transitionSmoothing: number;

  private enabled: boolean;
  private pendingTransitionResult: boolean | null = null;

  constructor(props: IOCameraRequestNodeProps) {
    super(props);

    this.targetInfluence = props.influence ?? 1;
    this.transitionDuration = props.transitionDuration ?? 500;
    this.transitionSmoothing = props.transitionSmoothing ?? 1;
    this.enabled = props.startActivated ?? false;

    this.cameraRequest = buildAdjustmentCameraRequest(
      this.id + "-camera-request",
      props,
      buildCameraProperties(props)
    );

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
      processor: new SignalProcessorBehavior({
        requireAllInputs: false,
        frameColor: "#fb923c",
        displayText: () => ({
          lines: [this.enabled ? "cam on" : "cam off"]
        }),
        process: (inputs, outputs) => {
          let emitted = new Map<string, SignalData>();
          if (this.pendingTransitionResult !== null) {
            emitted = deriveOutputsFor(this.pendingTransitionResult, outputs);
            this.pendingTransitionResult = null;
          }
          // An absent input reads as null; enable/disable are guarded, so the
          // stray disable() on emission-drain passes is a no-op.
          if (inputs.get("input")) this.enable();
          else this.disable();
          return emitted;
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    level.cameraDirector.sendRequest(this.cameraRequest);
  }

  /**
   * Emits true once the camera has finished transitioning in. A transition
   * superseded mid-lerp never resolves, so it never emits either.
   */
  private async enable(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;

    await this.level?.cameraDirector.lerpRequestInfluence(
      this.cameraRequest,
      this.targetInfluence,
      this.transitionDuration,
      this.transitionSmoothing
    );

    this.queueTransitionResult(true);
  }

  /** Emits false once the camera has finished transitioning out. */
  private async disable(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;

    await this.level?.cameraDirector.lerpRequestInfluence(
      this.cameraRequest,
      0,
      this.transitionDuration,
      this.transitionSmoothing
    );

    this.queueTransitionResult(false);
  }

  private queueTransitionResult(value: boolean): void {
    // A node torn down mid-transition has no business emitting afterwards.
    if (!this.level) return;
    this.pendingTransitionResult = value;
    this.behaviors.processor.queueProcessing();
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
