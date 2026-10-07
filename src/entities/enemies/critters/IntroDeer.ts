import { Object3D, Texture, Vector2 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import {
  CharacterGroundPhysicsControlBehaviorEvents,
  CharacterGroundPhysicsControlBehaviorStandard
} from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import deerBotJson from "../sprites/deer-bot/deer-bot.json";
import deerBotPng from "../sprites/deer-bot/deer-bot.png";

export type IntroDeerProps = EntityProps & {};

@addResourceLoader(new TextureResourceLoader("DeerBotTexture", deerBotPng))
export class IntroDeer extends CoreEntity {
  static type = "IntroDeer";
  public type = "IntroDeer";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public sprite = new ThreeAseprite({
    sourceJSON: deerBotJson,
    texture: getResource<Texture>(IntroDeer, "DeerBotTexture"),
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
    offset: new Vector2(-2, -19)
  });
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, 0, 4)
      .setSpeedLimits(4),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior(),
    perception: new PerceptionBehavior(),
    status: new StatusBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };
  constructor(props: IntroDeerProps) {
    super(props);
    this.sprite.gotoTag("idle");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl.init(this);
    this.behaviors.status.init(this).attachSprite(this.sprite);
    this.behaviors.physicsControl
      .attachPhysicsBehavior(this.behaviors.physics)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.outOfBounds.init(this);

    this.sprite.addTagFrameTrigger("jump", 3, "jumpApex");
    this.sprite.addEventListener("jumpApex", () => {
      this.sprite.playingAnimation = false;
    });

    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Jump,
      () => {
        this.sprite.gotoTag("jump");
        this.sprite.gotoTagFrame(2);
      }
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.JumpApex,
      () => {
        this.sprite.gotoTag("jump");
        this.sprite.gotoTagFrame(3);
        this.sprite.playingAnimation = false;
      }
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Land,
      () => {
        this.sprite.gotoTag("walk");
        this.sprite.playingAnimation = true;
      }
    );
  }
  step(ms: number) {
    super.step(ms);
    switch (this.sprite.getCurrentTag()) {
      case "idle":
        this.sprite.animate(ms * 0.5);
        break;
      default:
        this.sprite.animate(ms);
        break;
    }
    const xScale = this.behaviors.physicsControl.facingRight ? 1 : -1;
    this.object3D.scale.x = xScale;
    switch (this.sprite.getCurrentTag()) {
      case "jump":
        break;
      case "idle":
      case "walk": {
        const dx = this.behaviors.physicsControl.groundSpeed;
        if (dx === 0) {
          if (this.sprite.getCurrentTag() !== "idle") {
            this.sprite.gotoTag("idle");
          }
        } else {
          if (this.sprite.getCurrentTag() !== "walk") {
            this.sprite.gotoTag("walk");
          }
        }
        break;
      }
    }
  }
  faceImmediate(facingRight: boolean) {
    this.behaviors.physicsControl.facingRight = facingRight;
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
