import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2, Vector3 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import {
  ProtoSpriteLoader,
  TextureResourceLoader
} from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import dummySpriteJson from "../sprites/dummy/Dummy.json";
import dummySpritePng from "../sprites/dummy/Dummy.png";
import * as dummyFloatTypes from "../sprites/dummy/dummy_float";
import dummyFloatPrs from "../sprites/dummy/dummy_float.prs";
import * as dummySwordTypes from "../sprites/dummy/dummy_sword";
import dummySwordPrs from "../sprites/dummy/dummy_sword.prs";

export type DummyProps = EntityProps & {
  facingRight?: boolean;
};

@addResourceLoader(
  new TextureResourceLoader("dummySpriteTexture", dummySpritePng)
)
export class Dummy extends CoreEntity {
  static type = "Dummy";
  public type = Dummy.type;

  public object3D = new Object3D();
  public alignment = EntityAlignment.Enemy;
  public dead = false;
  public facingRight = false;

  public behaviors = {
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private sprite = new ThreeAseprite({
    texture: getResource(Dummy, "dummySpriteTexture"),
    sourceJSON: dummySpriteJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
    offset: new Vector2(2, -8)
  });

  constructor(props: DummyProps) {
    super(props);
    this.facingRight = props.facingRight ?? this.facingRight;
    const maxSize = Math.max(1 / 1.4, this.size.width, this.size.height * 0.5);
    this.size = {
      width: maxSize,
      height: maxSize * 2
    };
    this.behaviors.physics.init(this).setDensity(10);
    this.behaviors.status.init(this).attachSprite(this.sprite).setMaxHealth(10);
    this.behaviors.outOfBounds.init(this);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * maxSize * 1.4);
    if (this.facingRight) this.sprite.mesh.scale.x *= -1;
    this.object3D.add(this.sprite.mesh);
    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      this.sprite.playingAnimation = false;
      if (this.dead) {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
  hit(dmg: EntityHitDetails) {
    super.hit(dmg);
    if (this.dead) return;
    if (this.behaviors.status.health <= 0) {
      this.dead = true;
      this.die();
      return;
    }
    this.sprite.gotoTag("Get hit");
    this.sprite.gotoTagFrame(3);
    this.sprite.playingAnimation = true;
  }
  die() {
    super.die();
    this.dead = true;
    this.sprite.gotoTag("death");
    this.sprite.playingAnimation = true;
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms * 1.5);
  }
  disable() {
    this.behaviors.physics.disable();
    this.behaviors.status.healthEnabled = false;
  }
  enable() {
    this.behaviors.physics.enable();
    this.behaviors.status.healthEnabled = true;
  }
  setOpacity(opacity: number) {
    this.sprite.setOpacity(opacity);
    this.behaviors.status.healthBar.setOpacity(opacity);
  }
}

export type DummySwordProps = DummyProps & {
  withSword?: boolean;
};

@addResourceLoader(new ProtoSpriteLoader("dummySwordPS", dummySwordPrs))
export class DummySword extends CoreEntity implements BaseEntityType {
  static type = "DummySword";
  public type = DummySword.type;

  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public dead = false;

  private sprite = getResource<ProtoSpriteSheetThree>(
    DummySword,
    "dummySwordPS"
  ).getSprite<
    dummySwordTypes.dumysword_layers,
    dummySwordTypes.dumysword_animations
  >();

  public behaviors = {
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior().setMaxHealth(10),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  constructor(props: DummySwordProps) {
    super(props);

    const maxSize = Math.max(1 / 1.4, this.size.width, this.size.height * 0.5);
    this.size = {
      width: maxSize,
      height: maxSize * 2
    };

    if (!props.withSword) this.sprite.hideLayers("Sword");
    this.sprite.gotoAnimation("Attacks");
    this.sprite.setAnimationSpeed(0);
    this.sprite.center();
    this.sprite.mesh.position.y = maxSize * 0.05;
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * maxSize * 1.4);
    this.sprite.mesh.scale.y *= -1;
    if (props.facingRight) this.sprite.mesh.scale.x *= -1;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.physics.init(this).setDensity(10);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this.sprite.events.on(
      "animationLooped",
      this.updateAnimationState.bind(this)
    );
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
  private updateAnimationState(event: {
    animation: dummySwordTypes.dumysword_animations | null;
  }) {
    switch (event.animation) {
      case "Hit":
        this.sprite.gotoAnimation("Attacks");
        this.sprite.data.animationState.speed = 0;
        break;
      default:
        break;
    }
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    if (this.dead) return;
    if (this.behaviors.status.health <= 0) {
      this.dead = true;
      this.die();
      return;
    }
    this.sprite.gotoAnimation("Hit").gotoAnimationFrame(3).setAnimationSpeed(1);
  }
  die() {
    super.die();
    this.dead = true;
    this.sprite.gotoAnimation("Death");
    this.sprite.setAnimationSpeed(1);
    this.sprite.hideLayers("Left Arm", "Right Arm");
    this.sprite.events.on("animationLooped", () => {
      this.level?.removeEntity(this.id);
      this.destroy();
    });
  }
  setOpacity(opacity: number) {
    this.sprite.setOpacity(opacity);
    this.behaviors.status.healthBar.setOpacity(opacity);
    return this;
  }
  disable() {
    this.behaviors.physics.disable();
    this.behaviors.status.healthEnabled = false;
    return this;
  }
  enable() {
    this.behaviors.physics.enable();
    this.behaviors.status.healthEnabled = true;
    return this;
  }
}

@addResourceLoader(new ProtoSpriteLoader("dummyFloatPS", dummyFloatPrs))
export class DummyFloat extends CoreEntity implements BaseEntityType {
  static type = "DummyFloat";
  public type = DummyFloat.type;

  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public dead = false;

  public behaviors = {
    physics: new CharacterPhysicsBehavior().setGravityScale(0).setDamping(2),
    status: new StatusBehavior().setMaxHealth(10),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private sprite = getResource<ProtoSpriteSheetThree>(
    DummyFloat,
    "dummyFloatPS"
  ).getSprite<
    dummyFloatTypes.dumyfloat_layers,
    dummyFloatTypes.dumyfloat_animations
  >();

  private initialPos: Vector3;
  private targetPos: Vector3;

  constructor(props: DummyProps) {
    super(props);

    const maxSize = Math.max(1 / 1.4, this.size.width, this.size.height * 0.5);
    this.size = {
      width: maxSize,
      height: maxSize * 2
    };

    this.sprite.gotoAnimation("Floating Idle");
    this.sprite.center();
    this.sprite.mesh.position.y = -maxSize * 0.5;
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * maxSize * 1.4);
    this.sprite.mesh.scale.y *= -1;
    if (props.facingRight) this.sprite.mesh.scale.x *= -1;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.initialPos = this.position.clone();
    this.targetPos = this.position.clone();

    this.behaviors.physics.init(this).setDensity(2);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this.sprite.events.on(
      "animationLooped",
      this.updateAnimationState.bind(this)
    );
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);

    const rotZ = Math.max(
      -Math.PI * 0.25,
      Math.min(
        Math.PI * 0.25,
        -0.6 * (this.behaviors.physics.body?.linvel().x ?? 0)
      )
    );
    const rotZF = Math.min(1, ms * 0.01);
    this.sprite.mesh.rotation.z =
      this.sprite.mesh.rotation.z * (1 - rotZF) + rotZ * rotZF;

    const desiredPos = vector3To2(this.targetPos);
    const delta = desiredPos.sub(vector3To2(this.position));
    const linvel = this.behaviors.physics.body?.linvel();
    const dtSec = 0.5;
    const currentVel = new Vector2(linvel?.x, linvel?.y);
    const desiredVel = delta.clone().multiplyScalar(1 / dtSec);
    const acceleration = desiredVel
      .clone()
      .sub(currentVel)
      .multiplyScalar(1 / dtSec);
    acceleration.multiplyScalar(
      ms * 0.001 * (this.behaviors.physics.body?.mass() ?? 1)
    );
    this.behaviors.physics.body?.applyImpulse(acceleration, true);
  }
  private updateAnimationState(event: {
    animation: dummyFloatTypes.dumyfloat_animations | null;
  }) {
    switch (event.animation) {
      case "Gethit_float":
        this.sprite.gotoAnimation("Floating Idle");
        this.sprite.data.animationState.speed = 1;
        break;
      default:
        break;
    }
  }
  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    if (this.dead) return;
    if (this.behaviors.status.health <= 0) {
      this.dead = true;
      this.die();
      return;
    }
    this.sprite
      .gotoAnimation("Gethit_float")
      .gotoAnimationFrame(3)
      .setAnimationSpeed(1);
  }
  die() {
    super.die();
    this.dead = true;
    this.sprite.gotoAnimation("Floating_death");
    this.sprite.setAnimationSpeed(1);
    this.sprite.events.on("animationLooped", () => {
      this.level?.removeEntity(this.id);
      this.destroy();
    });
  }
  setOpacity(opacity: number) {
    this.sprite.setOpacity(opacity);
    this.behaviors.status.healthBar.setOpacity(opacity);
    return this;
  }
  disable() {
    this.behaviors.physics.disable();
    this.behaviors.status.healthEnabled = false;
    return this;
  }
  enable() {
    this.behaviors.physics.enable();
    this.behaviors.status.healthEnabled = true;
    return this;
  }
  startHovering() {
    this.scheduler.cancel("hover");
    this.scheduler.add({
      id: "hover",
      duration: 2000,
      recurring: true,
      invokeFunction: (t) => {
        const dy = Math.sin(t * 2 * Math.PI);
        this.targetPos = this.initialPos.clone();
        this.targetPos.y += dy;
      }
    });
    return this;
  }
}
