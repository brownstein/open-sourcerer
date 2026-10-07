import shortid from "shortid";
import { Color, Object3D, Texture, Vector2, Vector3 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityLevelAPI,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import {
  CasterEntityAPI,
  CasterEntityCastProps,
  createCastDeferredEmitter
} from "src/api/entitySpellCasting";
import { ColorRepresentation } from "src/api/util";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector2To3, vector3To2 } from "src/engine/util/vecTypes";
import type { EntityNetSummary } from "src/multiplayer/api";
import { Player } from "src/entities/player/Player";
import { FloatingSpherePhysicsBehavior } from "src/entities/shared/behaviors/FloatingSpherePhysics";
import { GlowParticlesBehavior } from "src/entities/shared/behaviors/GlowParticles";
import { incrementMana } from "src/redux/status/slice";
import { store } from "src/redux/store";

import manaballJson from "./sprites/manaball.json";
import manaballPng from "./sprites/manaball.png";

export type ManaSparkProps = EntityProps & {
  mana?: number;
  cameraFollow?: boolean;
};

const _kWhite = new Color(1, 1, 1);

export enum ManaSparkPositioning {
  Parked = "Parked",
  ZoomTo = "ZoomTo",
  Follow = "Follow"
}

export type MSPParked = {
  msp: ManaSparkPositioning.Parked;
  position: Vector2;
};

export type MSPZoomTo = {
  msp: ManaSparkPositioning.ZoomTo;
  position: Vector2;
};

export type MSPFollow = {
  msp: ManaSparkPositioning.Follow;
  entityId: string;
  offset?: Vector2;
};

export type ManaSparkPosition = MSPParked | MSPZoomTo | MSPFollow;

type _QueuedCastAnimation = {
  id: string;
  duration: number;
  color?: ColorRepresentation;
  resolve?: () => void;
  reject?: (reason: string) => void;
};

export type SparkCastAnimationProps = {
  color?: ColorRepresentation;
  duration?: number;
};

export function isManaSpark(entity: BaseEntityType): entity is ManaSpark {
  return entity.type === ManaSpark.type;
}

/**
 * The Mana Spark serves as a source of magic - magic can be
 * cast through Mana Sparks, and mana can be stored in them
 * to charge them.
 *
 * The number of Mana Sparks on screen needs
 * to be constrained, probably by an attribute of the player
 * inventory.
 */
@addResourceLoader(new TextureResourceLoader("manaballTexture", manaballPng))
export class ManaSpark
  extends CoreEntity
  implements BaseEntityType, CasterEntityAPI
{
  static type = "ManaSpark";
  public type = "ManaSpark";
  public object3D = new Object3D();
  public behaviors = {
    particles: new GlowParticlesBehavior(),
    physics: new FloatingSpherePhysicsBehavior().setRadius(0.125)
  };
  public dead = false;
  public positioning: ManaSparkPosition;

  // Mana allocation. This is public so that the Spark API can manipulate it.
  public mana = 0;

  private sprite: ThreeAseprite;
  // TODO: actual physics.
  private velocity = new Vector2();
  private motionTimer = 0;

  private castAnimationQueue: _QueuedCastAnimation[] = [];
  private castColor = new Color(0xffffff);
  private scale = 1;

  private _arrivalCallback?: {
    target: Vector2;
    resolve: () => void;
    startTime: number;
  };

  private readonly cameraFollow: boolean;

  constructor(props: ManaSparkProps) {
    super(props);
    this.object3D.position.copy(this.position);

    this.mana = props.mana ?? this.mana;
    this.cameraFollow = props.cameraFollow ?? false;
    this.scale = this.getScale();
    this.size = {
      width: this.scale,
      height: this.scale
    };

    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(ManaSpark, "manaballTexture"),
      sourceJSON: manaballJson
    });
    this.sprite.setColor(0xaaffff);
    this.sprite.gotoTag("Form");
    this.sprite.setOutline(2, 0xffffff, 1);
    this.sprite.mesh.scale.multiplyScalar(this.scale * kInvPixelScale);
    this.object3D.add(this.sprite.mesh);

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.dead) {
        this.sprite.playingAnimation = false;
        this.sprite.playingAnimationBackwards = false;
        this.sprite.gotoFrame(0);
        this.level?.removeEntity(this.id);
        return;
      }
      if (this.sprite.getCurrentTag() !== "Loop") this.sprite.gotoTag("Loop");
    });

    this.behaviors.particles.init(this);
    this.behaviors.particles.particleSettings.lifetimeMs = 500;
    this.behaviors.particles.object3D.position.z--;

    this.behaviors.physics.init(this);

    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      const scale = this.scale;
      if (p.ms === 0) p.color.set(this.castColor);
      p.size = p.size = scale * (ms / p.lifetimeMs);
      const r = Math.cos(p.seed) * scale;
      const clockwiseM = Math.sin(p.seed * Math.PI * 20) >= 0 ? 1 : -1;
      const offsetTheta = (p.seed * 10) % 1;
      const spinTheta = (p.ms * 0.005 + offsetTheta * Math.PI * 2) * clockwiseM;
      p.position.x = r * Math.cos(spinTheta);
      p.position.y = r * Math.sin(spinTheta);
      p.position.x += 0.125 * Math.cos(p.ms * 0.0125 + p.seed);
      p.position.y += 0.125 * Math.sin(p.ms * clockwiseM * 0.0125 + p.seed);
      p.color.lerp(this.castColor, ms / p.lifetimeMs);
    };

    this.positioning = {
      msp: ManaSparkPositioning.Parked,
      position: vector3To2(this.position)
    };
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    if (!this.cameraFollow) return;

    level.cameraDirector.sendLookAtEntityRequest(this, {
      lookaheadDistance: 0,
      size: new Vector2(8, 8),
      priority: 600
    });
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
    this.motionTimer += ms;

    // Update scale.
    this.scale = this.scale * 0.9 + this.getScale() * 0.1;

    // Update mesh.
    this.sprite.mesh.scale.x = this.scale * kInvPixelScale;
    this.sprite.mesh.scale.y = this.scale * kInvPixelScale;
    this.sprite.mesh.rotation.z += ms * 0.001;

    this._doVelocityUpdates();
    this._checkArrival();
  }
  private _checkArrival() {
    if (!this._arrivalCallback) return;
    const { target, resolve, startTime } = this._arrivalCallback;
    const dist = target.clone().sub(vector3To2(this.position)).length();
    const elapsed = Date.now() - startTime;
    if (dist < 0.08 || elapsed > 3000) {
      this.teleport(new Vector3(target.x, target.y, this.position.z));
      this.behaviors.physics.body?.setLinvel({ x: 0, y: 0 }, true);
      this.park();
      this._arrivalCallback = undefined;
      resolve();
    }
  }
  zoomToWithCallback(position: Vector2): Promise<void> {
    return new Promise<void>((resolve) => {
      this.zoomTo(position);
      this._arrivalCallback = {
        target: position,
        resolve,
        startTime: Date.now()
      };
    });
  }
  private getScale() {
    return (1.5 + Math.sqrt(this.mana)) * 0.05;
  }
  private _doVelocityUpdates() {
    const body = this.behaviors.physics.body;
    if (!body) return;
    const linvel = body.linvel();
    const velocity = new Vector2(linvel.x, linvel.y);
    velocity.multiplyScalar(0.9);
    switch (this.positioning.msp) {
      case ManaSparkPositioning.Parked: {
        const deltaToParked = this.positioning.position
          .clone()
          .sub(vector3To2(this.position));
        const perturb = new Vector2(
          Math.cos(this.motionTimer * 0.01),
          Math.sin(this.motionTimer * 0.01)
        );
        velocity
          .add(deltaToParked.multiplyScalar(0.2))
          .add(perturb.multiplyScalar(0.05));
        body.setLinvel(velocity, true);
        return;
      }
      case ManaSparkPositioning.ZoomTo: {
        // Constant speed for smooth movement; no deceleration near target.
        const delta = this.positioning.position
          .clone()
          .sub(vector3To2(this.position));
        const len = delta.length();
        if (len < 0.01) {
          body.setLinvel({ x: 0, y: 0 }, true);
          return;
        }
        const zoomSpeed = 6;
        delta.normalize().multiplyScalar(zoomSpeed);
        body.setLinvel({ x: delta.x, y: delta.y }, true);
        return;
      }
      case ManaSparkPositioning.Follow: {
        const targetEntity = this.level?.getEntity(this.positioning.entityId);
        if (!targetEntity) return;
        const deltaToPos = targetEntity.position.clone();
        if (this.positioning.offset) {
          deltaToPos.add(vector2To3(this.positioning.offset));
        } else if (targetEntity instanceof Player) {
          const offset = new Vector2(0, 1);
          if (targetEntity.isFacingRight()) {
            offset.x += 0.5;
          } else {
            offset.x -= 0.5;
          }
          deltaToPos.add(vector2To3(offset));
        }
        deltaToPos.sub(this.position);
        velocity.add(vector3To2(deltaToPos).multiplyScalar(0.4));
        body.setLinvel(velocity, true);
        return;
      }
    }
  }
  follow(entityId: string, offset?: Vector2) {
    this.positioning = {
      msp: ManaSparkPositioning.Follow,
      entityId,
      offset
    };
  }
  park() {
    this.positioning = {
      msp: ManaSparkPositioning.Parked,
      position: vector3To2(this.position)
    };
  }
  zoomTo(position: Vector2) {
    this.positioning = {
      msp: ManaSparkPositioning.ZoomTo,
      position
    };
  }
  die() {
    if (this.dead) return;
    this.events.emit(EntityLifecycleEvents.Die);
    this.dead = true;
    this.behaviors.particles.enableSpawn = false;
    this.sprite.playingAnimation = true;
    this.sprite.playingAnimationBackwards = true;
    this.sprite.gotoTag("Form");
    this.sprite.gotoTagFrame(11);
    for (const queuedCastAnimation of this.castAnimationQueue) {
      queuedCastAnimation.reject?.("Spark is dead.");
    }
    this.castAnimationQueue = [];
    // Add any allocated mana back to the mana pool.
    if (this.mana) store.dispatch(incrementMana(this.mana));
  }
  queuedCastAnimation(props: SparkCastAnimationProps = {}) {
    return new Promise<void>((resolve, reject) => {
      const prevQueued = this.castAnimationQueue.length > 0;
      this.castAnimationQueue.push({
        id: shortid(),
        color: props.color,
        duration: props.duration ?? 250,
        resolve,
        reject
      });
      if (!prevQueued) this._scheduleNextCastAnimation();
    });
  }
  private _scheduleNextCastAnimation() {
    const first = this.castAnimationQueue.at(0);
    if (!first) return;
    this.castColor.set(first.color ?? 0xffffff);
    this.scheduler.add({
      id: "castIn",
      duration: first.duration * 0.5,
      invokeFunction: (t) => {
        const spriteScale =
          kInvPixelScale * (this.scale + Math.sin(t * Math.PI * 0.5) * 0.2);
        this.sprite.setFade(this.castColor, Math.sin(t * Math.PI * 0.5));
        this.sprite.mesh.scale.x = spriteScale;
        this.sprite.mesh.scale.y = spriteScale;
      },
      invokeFunctionAtComplete: () => {
        first.resolve?.();
        first.resolve = undefined;
        first.reject = undefined;
      }
    });
    this.scheduler.add({
      id: "castOut",
      duration: first.duration * 0.5,
      startIn: first.duration * 0.5,
      invokeFunction: (t) => {
        const spriteScale =
          kInvPixelScale *
          (this.scale + Math.sin((t + 1) * Math.PI * 0.5) * 0.2);
        this.sprite.setFade(this.castColor, Math.sin((t + 1) * Math.PI * 0.5));
        this.sprite.mesh.scale.x = spriteScale;
        this.sprite.mesh.scale.y = spriteScale;
      },
      invokeFunctionAtComplete: () => this._advanceCastAnimationQueue()
    });
  }
  private _advanceCastAnimationQueue() {
    this.castColor.set(0xffffff);
    this.sprite.setFade(this.castColor, 0);
    this.castAnimationQueue.shift();
    this._scheduleNextCastAnimation();
  }
  public extraSpellBindingData() {
    return {
      mana: this.mana
    };
  }
  /** Multiplayer summary for remote ManaSparkStubs. */
  getNetSummary(): EntityNetSummary {
    const linvel = this.behaviors.physics.body?.linvel();
    return {
      pos: { x: this.position.x, y: this.position.y },
      vel: linvel ? { x: linvel.x, y: linvel.y } : undefined,
      scale: this.getScale()
    };
  }
  public doCast(opt: CasterEntityCastProps) {
    const deferred = createCastDeferredEmitter();
    const currentQueueLength = this.castAnimationQueue.length;
    if (opt.manaCost) this.mana -= opt.manaCost;
    if (this.mana < 0) {
      this.mana = 0;
      this.die();
      deferred.emit("manaOverdrawn");
      return deferred;
    }
    const outOfMana = this.mana === 0;
    const doCast = () => {
      this.castAnimationQueue.push({
        id: shortid(),
        color: opt.color ?? 0xffffff,
        duration: 250 / (opt.speed || 1),
        resolve: () => {
          deferred.emit("done");
          if (outOfMana) this.die();
        },
        reject: (reason?: string) => deferred.emit("cancel", reason)
      });
      if (!currentQueueLength) this._scheduleNextCastAnimation();
    };
    if (opt.hold && opt.progressEvents) {
      opt.progressEvents.once("aimTrigger", doCast);
    } else {
      doCast();
    }
    return deferred;
  }
  hasCastInProgress() {
    return !!this.castAnimationQueue.length;
  }
  getCastOrigin() {
    return this.position.clone();
  }
  addMana(mana: number) {
    this.mana += mana;
    return true;
  }
  subMana(mana: number) {
    if (this.mana < mana) return false;
    this.mana -= mana;
    return true;
  }
  /**
   * Gradually stream mana to any entity that implements CasterEntityAPI
   * (ManaSpark, Player, etc.) at the given rate. Returns a promise that
   * resolves when the full amount has been transferred. The sender's mana
   * (and therefore visual scale) updates every physics frame.
   */
  streamManaTo(
    target: CasterEntityAPI,
    amount: number,
    ratePerSec: number
  ): Promise<void> {
    return new Promise((resolve) => {
      let remaining = amount;
      const ratePerMs = ratePerSec / 1000;
      const onStep = (ms: number) => {
        const chunk = Math.min(remaining, ratePerMs * ms);
        this.mana -= chunk;
        target.addMana(chunk);
        remaining -= chunk;
        if (remaining <= 0) {
          this.events.off(EntityLifecycleEvents.Step, onStep);
          resolve();
        }
      };
      this.events.on(EntityLifecycleEvents.Step, onStep);
    });
  }
}
