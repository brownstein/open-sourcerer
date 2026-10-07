import {
  Animation,
  IkConstraint,
  SkeletonData
} from "@esotericsoftware/spine-core";
import { Object3D } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { OverlayAPI, OverlayPosition } from "src/api/overlay";
import { createTypedEventEmitter } from "src/api/util";
import {
  BossHealthBar,
  BossHealthBarEvents,
  BossHealthBarOverlayProps
} from "src/components/ui/overlays/overlays/BossHealthBar";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { SpineLoader } from "src/engine/spine/SpineLoader";
import { ThreeSpine } from "src/engine/spine/ThreeSpine";
import { UtilTimeline } from "src/engine/spine/TimelineUtils";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";

import { GaianBossAttachment } from "./GaianBossAttachment";
import { gaianRegionOverrides } from "./GaianBossRegionOverrides";
import { GaianKnockBackTimeline } from "./GaianBossTracks";
import robotAtlas from "./spine2/Gaian_v_02_3.atlas";
import robotPng from "./spine2/Gaian_v_02_3.png";
import skeletonJsonSrc from "./spine2/skeleton.json";

enum GaianAnimation {
  Idle = "Idle",
  Laser = "Laser",
  R_cover_face = "R_Cover_face",
  R_Punch_anticipation = "R_Punch_anticipation",
  R_Punch_down_no_IKtarget = "R_Punch_down_no_IKtarget",
  Slam_ground = "Slam ground"
}

@addResourceLoader(
  new SpineLoader({
    resourceName: "GaianBossSpineWrapper",
    sourceAtlasPath: robotAtlas,
    sourcePngPath: robotPng,
    sourcePngName: "Gaian_v_02_3.png",
    sourceJson: skeletonJsonSrc
  })
)
export class GaianBoss extends CoreEntity {
  static type = "GaianBoss";
  public type = "GaianBoss";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public children: BaseEntityType[] = [];

  public maxHealth = 100;
  public health = 100;
  public dead = false;

  // Rigging.
  private threeSpine: ThreeSpine;
  private leftHandAttachment?: GaianBossAttachment;
  private rightHandAttachment?: GaianBossAttachment;
  private headAttachment?: GaianBossAttachment;
  private ikLeftArm?: IkConstraint;
  private ikRightArm?: IkConstraint;
  private knockbackTimeline?: GaianKnockBackTimeline;

  // Health bar.
  private healthEvents = createTypedEventEmitter<BossHealthBarEvents>();
  private overlay?: OverlayAPI<BossHealthBarOverlayProps>;

  // Attack patterns.
  private breakoutStarted = false;
  private brokenOut = false;

  public behaviors = {
    outOfBounds: new OutOfBoundsBehaviour()
  };

  constructor(props: EntityProps) {
    super(props);
    this.object3D.position.copy(this.position);
    this.object3D.position.z--;

    const skeletonData = getResource<SkeletonData>(
      GaianBoss,
      "GaianBossSpineWrapper"
    );
    this.threeSpine = new ThreeSpine(skeletonData);
    this.threeSpine.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.threeSpine.mesh);

    // Override select regions' bounding boxes.
    this.threeSpine.setRegionOverrider(gaianRegionOverrides);

    // Make Gaian's head light green.
    this.threeSpine.setSlotShaderOverride("light", {
      fadeAmount: 1,
      fadeColor: 0x00ff00,
      opacity: 0.8
    });

    // Start silohetted.
    this.threeSpine.setFade(0.8, 0x000000);

    // Apply base pose and update bones.
    this._initTracks();
    this.behaviors.outOfBounds.init(this);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    this._constructAttachments();
    for (const child of this.children) level.addEntity(child);

    this.scheduler.add({
      startIn: 1000,
      duration: 1000,
      invokeFunctionAtStart: () => {
        this.overlay = level.ctx?.overlayProvider?.addOverlay({
          component: BossHealthBar,
          position: OverlayPosition.ViewportBottom,
          overlayProps: {
            bossName: "GAI:AN, Protector of the Forest",
            maxHealth: this.maxHealth,
            healthEvents: this.healthEvents
          }
        });
      },
      invokeFunction: (t) => {
        this.threeSpine.setFade(0.8 - t * 0.8, 0x000000);
      },
      invokeFunctionAtComplete: () => {
        this.threeSpine.setFade(0);
      }
    });
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);

    this.overlay?.remove();
    this.overlay = undefined;
  }
  destroy(): void {
    this.overlay?.remove();
    this.overlay = undefined;
  }
  private _constructAttachments() {
    const { threeSpine, level } = this;
    if (!threeSpine || !level) return;

    this.headAttachment = new GaianBossAttachment({
      position: this.position.clone(),
      parent: this,
      threeSpine,
      boneName: "robot_head",
      slotName: "robot_head",
      customShape(aabb) {
        const minDim = Math.min(
          aabb.size.x * 0.5 * kInvPixelScale,
          aabb.size.y * 0.5 * kInvPixelScale
        );
        return new level.rapier.RoundCuboid(
          aabb.size.x * 0.5 * kInvPixelScale - minDim,
          aabb.size.y * 0.5 * kInvPixelScale - minDim,
          minDim
        );
      }
    });

    this.rightHandAttachment = new GaianBossAttachment({
      position: this.position.clone(),
      parent: this,
      threeSpine,
      boneName: "right_hand",
      slotName: "right_hand",
      flashIntensity: 0.5
    });

    this.leftHandAttachment = new GaianBossAttachment({
      position: this.position.clone(),
      parent: this,
      threeSpine,
      boneName: "left_hand",
      slotName: "left_hand",
      flashIntensity: 0.5
    });

    this.ikRightArm =
      threeSpine.skeleton.findIkConstraint("right arm/right_ik_bend_arm") ??
      undefined;
    this.ikLeftArm =
      threeSpine.skeleton.findIkConstraint("Left arm/left_ik_bend_arm") ??
      undefined;

    threeSpine.update(0);
    this.headAttachment?.repositionFromBone();
    this.rightHandAttachment?.repositionFromBone();
    this.leftHandAttachment?.repositionFromBone();

    this.headAttachment.events.on(EntityLifecycleEvents.Hit, (hit) => {
      this.hitWeakSpot(hit);
    });

    this.children.push(
      this.headAttachment,
      this.rightHandAttachment,
      this.leftHandAttachment
    );
  }
  private _initTracks() {
    const { threeSpine } = this;
    const { skeleton } = threeSpine;

    // Set a base timeline that resets the position of
    // some of the extremities.
    const timelineBase = new UtilTimeline(1);
    timelineBase.copyState(
      skeleton,
      new Set(["head", "neck", "chest", "left_shoulder"])
    );
    const animationBase = new Animation("base_state", [timelineBase], 1);
    threeSpine.animationState.setAnimationWith(0, animationBase);

    // Add the meaty behavior tracks.
    // threeSpine.animationState.setAnimation(1, "robot_state_stuck");
    const s = threeSpine.animationState.setAnimation(
      1,
      GaianAnimation.R_Punch_anticipation
    );
    s.loop = true;

    // Update the skeleton and transforms so we can snapshot the state.
    threeSpine.update();

    // Add knockback overrides track.
    const knockbackTimeline = new GaianKnockBackTimeline(1).setup(skeleton);
    const animationKnockback = new Animation(
      "knockback",
      [knockbackTimeline],
      1
    );
    threeSpine.animationState.setAnimationWith(3, animationKnockback);
    this.knockbackTimeline = knockbackTimeline;
  }
  private t = 0;
  step(ms: number) {
    super.step(ms);
    this.t += ms;
    this.threeSpine.update(ms * 0.001);

    if (this.dead) return;

    if (this.knockbackTimeline) {
      this.knockbackTimeline.forwardTilt = 0.25 * Math.cos(this.t * 0.001);
    }

    if (this.ikRightArm) {
      this.ikRightArm.target.x = -230;
      this.ikRightArm.target.y = -20 - 40 * Math.sin(this.t * 0.002);
    }

    this.headAttachment?.repositionFromBone();
    this.rightHandAttachment?.repositionFromBone();
    this.leftHandAttachment?.repositionFromBone();
  }
  hitWeakSpot(hit: EntityHitDetails) {
    this.health -= hit.damage;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
      return;
    }
    if (this.health <= this.maxHealth * 0.5 && !this.breakoutStarted) {
      this.doBreakout();
    }

    this.healthEvents.emit("healthUpdated", this.health);

    this.scheduler.cancel("headKnockBack");
    this.scheduler.add({
      id: "headKnockBack",
      duration: 500,
      invokeFunction: (t) => {
        if (!this.knockbackTimeline) return;
        this.knockbackTimeline.headTilt = -Math.sin(t * Math.PI) * 0.25;
      }
    });
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.healthEvents.emit("dead");

    this.headAttachment?.deactivate();
    this.rightHandAttachment?.deactivate();
    this.leftHandAttachment?.deactivate();

    const animationState = this.threeSpine.animationState;
    const breakoutTrack = animationState.addAnimation(
      1,
      GaianAnimation.Slam_ground
    );
    breakoutTrack.listener = {
      complete: () => {}
    };
  }
  doBreakout() {
    this.breakoutStarted = true;
    const animationState = this.threeSpine.animationState;
    const breakoutTrack = animationState.addAnimation(1, GaianAnimation.Idle);
    breakoutTrack.listener = {
      complete: () => {
        this.brokenOut = true;
      }
    };
    if (this.knockbackTimeline) {
      this.knockbackTimeline.forwardTilt = 0;
      this.knockbackTimeline.leftShoulderConstrained = false;
    }
  }
}
