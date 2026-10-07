import RAPIER from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import { CharacterCustomization } from "src/api/characterCustomization";
import {
  DamageType,
  ElementalType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI
} from "src/api/entity";
import { CBM, getGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import {
  getAsset,
  setAssetDependencies
} from "src/engine/entity/decorators";
import { getPlayer } from "src/engine/util/levelUtil";
import { Text } from "src/entities/environment/Text";
import {
  PlayerAnimation,
  PlayerSprite,
  SpellsSprite,
  customizePlayerSprite
} from "src/entities/player/PlayerInternals";
import { SpellSpriteSyncBehavior } from "src/entities/player/SpellSpriteSyncBehavior";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import * as spellTypes from "src/entities/player/sprites/wolf-spells";

import { EntityNetSummary } from "../api";
import { StubEntity, StubEntityProps } from "./StubEntity";

export type PlayerStubProps = StubEntityProps & {
  customization?: CharacterCustomization;
  displayName?: string;
  nameColor?: string;
};

/** Animation tags that play once and hold rather than looping. */
const NON_LOOPING_TAGS = new Set<string>([
  "ascend",
  "reach_peak",
  "descend",
  "death",
  "parry",
  "swing",
  "swing_1",
  "swing_2",
  "chest",
  "unsheath",
  "sheath",
  "put_sword_on_back",
  "air_rock_spell",
  "attack_ladder_step01"
]);

/** Upper-body tags whose frame is slaved to the owner's reports (cast holds
 *  pin a pose indefinitely; free-running them stub-side would drift). */
const FRAME_SLAVED_TAGS = new Set<string>([
  "spell",
  "fast_spell",
  "spell_ladder01",
  "air_rock_spell"
]);

/**
 * Collision group for remote player stubs: Enemies membership so the local
 * player's attacks connect (sword AnimatedHitRegions target
 * EntityAlignment.Enemy through the Damage filter, projectile raycasts
 * require a Projectiles-filter match) and so the local player's body
 * physically separates from the stub (playerCollisionGroup filters Enemies).
 * The stub body is kinematic — the local player always yields on this
 * screen, and the opposite happens on the opponent's screen, which reads as
 * a mutual push-apart.
 */
const stubCollisionGroup = getGroup(
  CBM.Enemies,
  CBM.Player | CBM.Projectiles | CBM.Damage | CBM.Sensor
);

/**
 * Presentation stub for a remote peer's Player. Dead-reckons the owner's
 * reported motion; mirrors per-part (upper/lower) animation, facing, sword,
 * cast VFX (via the same SpellSpriteSyncBehavior the real player uses), and
 * status effects (via StatusBehavior, driven by replicated hit events).
 *
 * The stub is deliberately NOT `isPlayerAPI` — `getPlayer()` and spell
 * caster resolution must keep finding only the local player — but it IS
 * `EntityAlignment.Enemy`, so local attacks hit it (eager feedback before
 * network confirmation), physics separates it from the local player, and
 * spell sensor/aim modules can target it (scripting attacks against
 * opponents).
 */
@setAssetDependencies(() => ["wolfMaleSprite", "wolfFemaleSprite", "wolfSpells"])
export class PlayerStub extends StubEntity {
  static type = "PlayerStub";
  public type = PlayerStub.type;
  public alignment = EntityAlignment.Enemy;
  /** Spell variable prefix: opponents bind as opponent_1, opponent_2, ... */
  public bindingPrefix = "opponent";

  public behaviors = {
    status: new StatusBehavior(),
    spellSprite: new SpellSpriteSyncBehavior()
  };

  private readonly upperSprite: PlayerSprite;
  private readonly lowerSprite: PlayerSprite;
  private readonly spellsSprite: SpellsSprite;
  private readonly displayName: string;
  private nameTag?: Text;
  private currentUpperTag = "idle";
  private currentLowerTag = "idle";
  private facing: 1 | -1 = 1;
  private upperFlip = false;
  private swordVisible = false;
  private slavedUpperFrame: number | null = null;
  private body?: RAPIER.RigidBody;

  /** Authoritative hp ratio from the owner's last summary. */
  private authoritativeHp = 1;
  private maxHp = 50;
  /** Damage shown eagerly before the next authoritative report confirms. */
  private eagerHpDeficit = 0;

  // Reusable vectors for the upper/lower alignment math.
  private readonly alignA = new Vector2();
  private readonly alignB = new Vector2();

  constructor(props: PlayerStubProps) {
    super(props);
    this.displayName = props.displayName ?? "";
    this.size = {
      width: 24 * kInvPixelScale,
      height: 52 * kInvPixelScale
    };

    const sprites = customizePlayerSprite(
      {
        wolfMale: getAsset("wolfMaleSprite"),
        wolfFemale: getAsset("wolfFemaleSprite")
      },
      props.customization ?? {}
    );
    this.upperSprite = sprites.upperSprite;
    this.lowerSprite = sprites.lowerSprite;
    this.upperSprite.setLayerOpacity(0, "sword", true);

    this.spellsSprite = getAsset("wolfSpells").getSprite<
      spellTypes.sprite_layers,
      spellTypes.sprite_animations
    >();
    this.spellsSprite.center();
    this.spellsSprite.mesh.scale.set(
      kInvPixelScale,
      -kInvPixelScale,
      kInvPixelScale
    );
    this.spellsSprite.mesh.position.z = 1;

    this.object3D.add(this.lowerSprite.mesh);
    this.object3D.add(this.upperSprite.mesh);
    this.object3D.add(this.spellsSprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.status.init(this);
    this.behaviors.status.healthEnabled = false;
    this.behaviors.status
      .attachProtosSprite(this.upperSprite)
      .attachProtosSprite(this.lowerSprite);
    this.behaviors.spellSprite.attachSprites(
      this.spellsSprite,
      this.upperSprite
    );

    if (this.displayName) {
      this.nameTag = new Text({
        position: this.position.clone(),
        troika: true,
        textPixelSize: 8,
        textAlign: "center",
        textWrap: false,
        text: this.displayName,
        textColor: props.nameColor ?? "#FFFFFF",
        outline: true,
        outlineColor: "#000000FF"
      });
    }

    this.onSummary(this.lastSummary);
  }

  attachToLevel(level: EntityLevelAPI): void {
    // CoreEntity.attachToLevel wires up the behaviors (spellSprite's level
    // Step subscription, status's entity events).
    super.attachToLevel(level);

    const bodyDesc = level.rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.position.x, this.position.y);
    this.body = level.world.createRigidBody(bodyDesc);
    const colliderDesc = level.rapier.ColliderDesc.cuboid(
      this.size.width * 0.5,
      this.size.height * 0.5
    ).setCollisionGroups(stubCollisionGroup);
    level.world.createCollider(colliderDesc, this.body);
    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.body.handle
    });

    if (this.nameTag) level.addEntity(this.nameTag);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    if (this.nameTag) level.removeEntity(this.nameTag.id);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) {
      level.world.removeRigidBody(this.body);
      this.body = undefined;
    }
    super.detachFromLevel(level);
  }

  protected onSummary(summary: EntityNetSummary): void {
    const animUpper =
      typeof summary.animUpper === "string" ? summary.animUpper : "idle";
    const animLower =
      typeof summary.animLower === "string" ? summary.animLower : "idle";
    if (animUpper !== this.currentUpperTag) {
      this.currentUpperTag = animUpper;
      this.playTag(this.upperSprite, animUpper);
    }
    if (animLower !== this.currentLowerTag) {
      this.currentLowerTag = animLower;
      this.playTag(this.lowerSprite, animLower);
    }
    this.slavedUpperFrame =
      FRAME_SLAVED_TAGS.has(animUpper) &&
      typeof summary.animUpperFrame === "number"
        ? summary.animUpperFrame
        : null;

    if (summary.facing === 1 || summary.facing === -1) {
      this.facing = summary.facing;
    }
    this.upperFlip = summary.upperFlip === true;

    const sword = summary.sword === true;
    if (sword !== this.swordVisible) {
      this.swordVisible = sword;
      this.upperSprite.setLayerOpacity(sword ? 1 : 0, "sword", true);
    }

    if (typeof summary.maxHp === "number" && summary.maxHp > 0) {
      this.maxHp = summary.maxHp;
    }
    if (typeof summary.hp === "number") {
      // An authoritative report supersedes any eager local prediction.
      this.authoritativeHp = Math.max(0, Math.min(1, summary.hp));
      this.eagerHpDeficit = 0;
      this.updateHealthBar();
    }
  }

  private updateHealthBar(): void {
    this.behaviors.status.healthBar.setHealth(
      Math.max(0, Math.min(1, this.authoritativeHp - this.eagerHpDeficit))
    );
  }

  private playTag(sprite: PlayerSprite, tag: string): void {
    const known = sprite.data.sprite.maps.animationMap.has(
      tag as PlayerAnimation
    );
    const safeTag = (known ? tag : "idle") as PlayerAnimation;
    sprite.setAnimationLooping(!NON_LOOPING_TAGS.has(safeTag));
    sprite.setAnimationSpeed(1);
    sprite.gotoAnimation(safeTag);
  }

  /**
   * Local attacks connecting with this stub land here (projectile collision
   * callbacks, melee hit regions). The consequence is eager and cosmetic:
   * flash/status via StatusBehavior and a provisional health-bar dip, both
   * reconciled by the owner's next authoritative report. Real damage is
   * always decided on the victim's own client.
   */
  hit(details: EntityHitDetails): void {
    this.eagerHpDeficit += details.damage / this.maxHp;
    this.updateHealthBar();
    // StatusBehavior listens for the Hit lifecycle event and plays the
    // element-appropriate flash/burn visuals.
    super.hit(details);
  }

  handleNetEvent(kind: string, data: unknown): void {
    switch (kind) {
      case "swing": {
        const swing = (data ?? {}) as { damage?: number; reach?: number };
        const damage = typeof swing.damage === "number" ? swing.damage : 5;
        const reach = typeof swing.reach === "number" ? swing.reach : 1.8;
        // Check at the approximate moment the blade is out.
        this.scheduler.add({
          id: `swing-${this.lifetimeMs}`,
          duration: 120,
          invokeFunctionAtComplete: () => this.checkSwingHit(damage, reach)
        });
        break;
      }
      case "castStart": {
        const cast = (data ?? {}) as {
          castSpeed?: number;
          element?: string | null;
        };
        this.behaviors.spellSprite.playCast(
          (cast.element ?? undefined) as ElementalType | undefined,
          typeof cast.castSpeed === "number" ? cast.castSpeed : 1
        );
        break;
      }
      case "castHoldStart":
        this.behaviors.spellSprite.beginHold();
        break;
      case "castHoldEnd":
        this.behaviors.spellSprite.releaseHold();
        break;
      case "castEnd":
        this.behaviors.spellSprite.onCastFired();
        break;
      case "tookHit": {
        // The owner took a hit: mirror the status-effect visuals its own
        // player showed (fire burn, wind flash, ...). Damage itself arrives
        // authoritatively via the hp summary field.
        const took = (data ?? {}) as {
          damage?: number;
          element?: string | null;
        };
        this.behaviors.status.applyHitWithDuration({
          hittingEntity: this,
          sourceEntity: this,
          damage: typeof took.damage === "number" ? took.damage : 1,
          elementalDamageType: (took.element ?? undefined) as
            | ElementalType
            | undefined
        });
        break;
      }
      case "parry":
        // Brief white flash for the parry stance.
        this.behaviors.status.applyHitWithDuration(
          {
            hittingEntity: this,
            sourceEntity: this,
            damage: 1
          },
          150
        );
        break;
    }
  }

  /** Melee swings replicate as events; this client decides whether its own
   *  player is inside the arc (victim-authoritative damage). */
  private checkSwingHit(damage: number, reach: number): void {
    if (!this.level) return;
    const player = getPlayer(this.level);
    if (!player) return;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const inFront = this.facing === 1 ? dx >= -0.3 : dx <= 0.3;
    if (!inFront) return;
    if (!(Math.abs(dx) <= reach && Math.abs(dy) <= 1.3)) return;
    const details: EntityHitDetails = {
      hittingEntity: this,
      sourceEntity: this,
      damage,
      damageType: DamageType.Slash,
      hitImpulse: new Vector2(this.facing * 3, 2)
    };
    player.hit?.(details);
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    // Facing: the whole body flips with `facing`; the upper body may be
    // additionally flipped (running backwards while aiming the other way).
    this.lowerSprite.mesh.scale.x =
      this.facing * Math.abs(this.lowerSprite.mesh.scale.x);
    this.upperSprite.mesh.scale.x =
      this.facing *
      (this.upperFlip ? -1 : 1) *
      Math.abs(this.upperSprite.mesh.scale.x);

    this.lowerSprite.advance(deltaMs);
    if (this.slavedUpperFrame !== null) {
      this.upperSprite.gotoAnimationFrame(this.slavedUpperFrame);
    } else {
      this.upperSprite.advance(deltaMs);
    }

    this.alignUpperToLower();

    if (this.body) {
      this.body.setNextKinematicTranslation(
        new Vector2(this.position.x, this.position.y)
      );
    }
    if (this.nameTag) {
      this.nameTag.position.copy(this.position);
      this.nameTag.position.y += this.size.height * 0.5 + 0.9;
      this.nameTag.teleport(this.nameTag.position);
    }
  }

  /** Pin the upper sprite to the lower via the align_hip marker, the same
   *  alignment the real player's AnimationControlBehavior computes. */
  private alignUpperToLower(): void {
    const upperBounds = this.upperSprite.getLayerBounds("align_hip");
    const lowerBounds = this.lowerSprite.getLayerBounds("align_hip");
    if (
      !isFinite(upperBounds.min.x) ||
      !isFinite(lowerBounds.min.x) ||
      upperBounds.max.x < upperBounds.min.x ||
      lowerBounds.max.x < lowerBounds.min.x
    ) {
      return;
    }
    upperBounds.getCenter(this.alignA);
    lowerBounds.getCenter(this.alignB);
    this.alignA.x *= this.upperSprite.mesh.scale.x;
    this.alignA.y *= this.upperSprite.mesh.scale.y;
    this.alignB.x *= this.lowerSprite.mesh.scale.x;
    this.alignB.y *= this.lowerSprite.mesh.scale.y;
    this.upperSprite.mesh.position.x = -(this.alignA.x - this.alignB.x);
    this.upperSprite.mesh.position.y = -(this.alignA.y - this.alignB.y);
  }

  /** Spell bindings (opponents bind as enemy variables via Enemy alignment)
   *  expose enough to script attacks against another player. */
  extraSpellBindingData() {
    return {
      name: this.displayName,
      health: this.authoritativeHp * this.maxHp,
      maxHealth: this.maxHp,
      facingRight: this.facing === 1,
      velocity: { x: this.sampledVelocity.x, y: this.sampledVelocity.y }
    };
  }

  destroy(): void {
    // CoreEntity.destroy tears down the behaviors.
    this.upperSprite.dispose();
    this.lowerSprite.dispose();
    this.spellsSprite.dispose();
    super.destroy();
  }
}
