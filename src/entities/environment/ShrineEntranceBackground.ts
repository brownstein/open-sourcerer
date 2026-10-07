import { Object3D } from "three";

import { CameraRequestPriority } from "src/api/camera";
import { EntityAlignment, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { isolateLayer } from "src/util/spriteUtils";

import {
  ShrineEntranceBackgroundAnimation,
  ShrineEntranceBackgroundLayer
} from "./sprites/shrine-background/shrine-entrance-background";

@setAssetDependencies(() => ["shrineEntranceBackgroundSprite"])
export class ShrineEntranceBackground extends CoreEntity {
  static readonly type = "ShrineEntranceBackground";
  public readonly type = ShrineEntranceBackground.type;

  public shrineEntranceEvents = createTypedEventEmitter<{
    cutsceneEnd: void;
  }>();

  public alignment = EntityAlignment.Environment;

  public object3D = new Object3D();
  public backgroundSprite = getAsset(
    "shrineEntranceBackgroundSprite"
  ).getSprite<
    ShrineEntranceBackgroundLayer,
    ShrineEntranceBackgroundAnimation
  >();
  public foregroundSprite = getAsset(
    "shrineEntranceBackgroundSprite"
  ).getSprite<
    ShrineEntranceBackgroundLayer,
    ShrineEntranceBackgroundAnimation
  >();

  private shouldOpen = false;

  private readonly animationSpeed = 0.5;
  private readonly cameraShakeRequestId =
    "ShrineEntranceBackground" + crypto.randomUUID();

  constructor(props: EntityProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.backgroundSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.backgroundSprite.mesh.scale.y *= -1;
    this.backgroundSprite.center();

    this.foregroundSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.foregroundSprite.mesh.scale.y *= -1;
    this.foregroundSprite.center();

    this.backgroundSprite.hideLayers("foreground");
    isolateLayer(this.foregroundSprite, "foreground");

    this.backgroundSprite.mesh.position.z = -0.5;
    this.foregroundSprite.mesh.position.z = 0.5;

    this.backgroundSprite.setAnimationSpeed(this.animationSpeed);
    this.foregroundSprite.setAnimationSpeed(this.animationSpeed);

    this.backgroundSprite.events.once("animationTagStarted", () =>
      this.backgroundSprite.setAnimationSpeed(0)
    );
    this.foregroundSprite.events.once("animationTagStarted", async () => {
      this.foregroundSprite.setAnimationSpeed(0);

      await this.scheduler.asyncTimeout(1500);
      await this.level?.cameraDirector.smoothRemoveRequests(
        this.cameraShakeRequestId,
        3500
      );
      this.shrineEntranceEvents.emit("cutsceneEnd");
    });

    this.object3D.add(this.backgroundSprite.mesh, this.foregroundSprite.mesh);
  }
  step(ms: number) {
    super.step(ms);

    if (!this.shouldOpen) return;

    this.backgroundSprite.advance(ms);
    this.foregroundSprite.advance(ms);
  }

  open() {
    this.shouldOpen = true;

    this.level?.cameraDirector.smoothSendRequest(
      {
        id: this.cameraShakeRequestId,
        priority: CameraRequestPriority.SCRIPTED,
        influence: 0,
        subPriority: 500,
        shake: 1,
        letterboxingPercentage: 1
      },
      1,
      2500
    );
  }

  openImmediately() {
    this.backgroundSprite.setAnimationSpeed(0).gotoAnimation("opened");
    this.foregroundSprite.setAnimationSpeed(0).gotoAnimation("opened");
  }
}
