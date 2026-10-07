import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import {
  BaseEntityType,
  DamageType,
  EntityAlignment,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import {
  CasterEntityCastProps,
  DoCastDeferredEmitter,
  createCastDeferredEmitter
} from "src/api/entitySpellCasting";
import { SpellsAPI } from "src/api/spells";
import {
  playerCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPhysicsScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import { Debounce, Do, Sequence, Wait } from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { SpellCast } from "src/entities/shared/aiNodes/consumerNodes/AISpellCastNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  AnimationControlBehavior,
  AnimationPriority,
  SpriteFacingDirection
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { calculateProjectileAngleToInterncept } from "src/util/projectileMath";

import {
  sprite_animations,
  sprite_layers
} from "./OpenSourserer_Allcharacters";
import dogPrs from "./sprites/all-characters.prs";

export type DogNPCProps = EntityProps & {
  spellCode?: string;
  spellCastIntervalMs?: number;
  target?: string; // Name of other entity in the scene to target.
  spell?: string; // Select which spell(s) to cast: "bullet", "fire", "ice", "earth", or "all" (default cycles through all)
  spread?: number;
  burstQty?: number; // Number of spells to rapid fire before waiting.
  reloadTime?: number; // Time in seconds to wait before firing another burst of spells.
};

@addResourceLoader(new ProtoSpriteLoader("dogSheet", dogPrs))
export class DogNPC extends CoreEntity {
  static readonly type = "DogNPC";
  public readonly type = DogNPC.type;

  public alignment = EntityAlignment.NPC;
  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    DogNPC,
    "dogSheet"
  ).getSprite<sprite_layers, sprite_animations>();

  public dead = false;
  public facingRight = false;
  public target: string;
  public burstQty: number;
  public reloadTime: number;
  public targetEntity: BaseEntityType;
  private readonly contactDamage = 5;
  private readonly contactImpulseMultiplier = 10;
  private readonly contactSelfImpulseMultiplier = 4;
  private readonly contactSelfDamage = 0;

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(0)
      .setFly(false),
    physics: new CharacterPhysicsBehavior()
      .setGroup(playerCollisionGroup)
      .setDensity(1)
      .setGravityScale(1)
      .setDamping(1),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    status: new StatusBehavior().setMaxHealth(80),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<sprite_animations>({
      idle: {
        tagName: "Dog_Idle",
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    collision: new CollisionDamageBehavior(
      this.contactDamage,
      this.contactImpulseMultiplier,
      this.contactSelfImpulseMultiplier,
      this.contactSelfDamage,
      DamageType.Blunt
    ),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private readonly deathAnimationData: APIAnimationData<sprite_animations> = {
    tagName: "Dog_Idle",
    startFrame: 1,
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private spellApi?: SpellsAPI;
  private readonly customSpellCode?: string;
  private readonly spellCastIntervalMs: number;
  private readonly randomBulletSpreadArr: number[] = [
    0.0428, -0.0516, 0.0729, -0.0709, 0.077, -0.0562
  ];
  private spreadArrIter = 0;
  private relativeSpread = 1;
  private readonly bulletSpell = `
    var Projectile = require("projectile");
    var self = require("self");

    var angle = self.extra.castAngle + self.extra.spreadAdjustment;
    var speed = 18;
    var vx = Math.cos(angle) * speed;
    var vy = Math.sin(angle) * speed;

    new Projectile({
      velocity: { x: vx, y: vy },
      colorInner: { r: 0.3, g: 0.4, b: 0.9 },
      colorOuter: { r: 0.9, g: 0.9, b: 0.6 },
      colorTrail: { r: 0.6, g: 0.6, b: 0.5 },
      radius: 0.04,
      gravity: 0,
      trailMaxLength: 14,
      trailLengthMs: 150,
      enableParticles: false,
      strength: 5,
      terrainIgnoreRadius: 3
    });
  `;

  private readonly fireSpell = `
    var Fire = require("fire");
    var self = require("self");

    var angle = self.extra.castAngle + self.extra.spreadAdjustment;
    var speed = 10;
    var vx = Math.cos(angle) * speed;
    var vy = Math.sin(angle) * speed;

    new Fire({ velocity: { x: vx, y: vy }, strength: 10 });
  `;

  private readonly iceSpell = `
    var Projectile = require("projectile");
    var self = require("self");

    var angle = self.extra.castAngle + self.extra.spreadAdjustment;
    var speed = 14;
    var vx = Math.cos(angle) * speed;
    var vy = Math.sin(angle) * speed;

    new Projectile({
      velocity: { x: vx, y: vy },
      colorInner: { r: 0.6, g: 0.9, b: 1.0 },
      colorOuter: { r: 0.2, g: 0.6, b: 0.9 },
      colorTrail: { r: 0.4, g: 0.7, b: 1.0 },
      radius: 0.06,
      gravity: 0,
      trailMaxLength: 18,
      trailLengthMs: 200,
      enableParticles: true,
      strength: 8,
      elementalType: "Ice",
      terrainIgnoreRadius: 3
    });
  `;

  private readonly earthSpell = `
    var Projectile = require("projectile");
    var self = require("self");

    var angle = self.extra.castAngle + self.extra.spreadAdjustment;
    var speed = 12;
    var vx = Math.cos(angle) * speed;
    var vy = Math.sin(angle) * speed;

    new Projectile({
      velocity: { x: vx, y: vy },
      colorInner: { r: 0.5, g: 0.35, b: 0.2 },
      colorOuter: { r: 0.3, g: 0.2, b: 0.1 },
      colorTrail: { r: 0.4, g: 0.3, b: 0.15 },
      radius: 0.08,
      gravity: 0.3,
      trailMaxLength: 10,
      trailLengthMs: 120,
      enableParticles: true,
      strength: 12,
      elementalType: "Earth",
      terrainIgnoreRadius: 3
    });
  `;

  private readonly spellMap: Record<string, string> = {
    bullet: this.bulletSpell,
    fire: this.fireSpell,
    ice: this.iceSpell,
    earth: this.earthSpell
  };
  private spellsBarrel: string[];
  private spellBarrelItr = 0;

  constructor(props: DogNPCProps) {
    super(props);

    this.customSpellCode = props.spellCode;
    this.spellCastIntervalMs = Number(props.spellCastIntervalMs ?? 200);
    this.target = props.target ?? "";
    this.burstQty = Number(props.burstQty ?? 3);
    this.reloadTime = Number(props.reloadTime ?? 1) * 1000;
    this.relativeSpread = Number(props.spread ?? 1);

    const spellSelection = props.spell?.toLowerCase();
    if (
      spellSelection &&
      spellSelection !== "all" &&
      this.spellMap[spellSelection]
    ) {
      this.spellsBarrel = [this.spellMap[spellSelection]];
    } else {
      this.spellsBarrel = [
        this.bulletSpell,
        this.fireSpell,
        this.iceSpell,
        this.earthSpell
      ];
    }

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPhysicsScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);
    this.targetEntity = this;
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this).setSize(new Vector2(0.8, 0.8));
    this.behaviors.physicsControl
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .init(this);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this._setupBehaviorTree();
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.setTargetEntity();
    this.updateSprite();
  }

  private _setupBehaviorTree(): void {
    // Constructing the BehaviorTree nodes to wait a second after a few spell casts.
    const castsBeforePause = this.burstQty;
    const spellSequenceNodes = [];
    for (let i = 0; i < castsBeforePause; i++) {
      spellSequenceNodes.push(
        Debounce(
          this.spellCastIntervalMs,
          SpellCast(() => ({
            spellCode:
              this.customSpellCode ?? this.spellsBarrel[this.spellBarrelItr],
            getSpellApi: () => this.spellApi
          }))
        ),
        Do(
          () =>
            (this.spellBarrelItr =
              (this.spellBarrelItr + 1) % this.spellsBarrel.length)
        ),
        Wait(this.spellCastIntervalMs)
      );
    }
    spellSequenceNodes.push(Wait(this.reloadTime));

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Sequence(...spellSequenceNodes)
    );
  }

  attachToSpellApi(api: SpellsAPI) {
    this.spellApi = api;
  }

  detachFromSpellApi(_api: SpellsAPI) {
    this.spellApi = undefined;
  }

  // CasterEntityAPI — allows the Dog's ID to serve as a spell caster
  hasCastInProgress() {
    return false;
  }

  doCast(_castProps: CasterEntityCastProps): DoCastDeferredEmitter {
    const emitter = createCastDeferredEmitter();
    emitter.emit("done");
    return emitter;
  }

  addMana(_mana: number) {
    return true;
  }

  subMana(_mana: number) {
    return true;
  }

  getCastOrigin() {
    const origin = this.position.clone();
    origin.y += 1.2;
    origin.x += 0.9 * (this.facingRight ? 1 : -1);
    return origin;
  }

  extraSpellBindingData() {
    const speed = 18;

    //Set the target if not already set
    this.setTargetEntity();

    this.facingRight = this.targetEntity.position.x > this.position.x;
    this.updateSprite();

    const castOrigin = this.getCastOrigin();
    const relativePos = new Vector2(
      this.targetEntity.position.x - castOrigin.x,
      this.targetEntity.position.y - castOrigin.y
    );
    const castAngle =
      calculateProjectileAngleToInterncept(relativePos, speed) ??
      (this.facingRight ? -Math.PI / 4 : (-Math.PI * 3) / 4);

    this.spreadArrIter =
      (this.spreadArrIter + 1) % this.randomBulletSpreadArr.length;

    return {
      facingRight: this.facingRight,
      castAngle,
      spreadAdjustment:
        this.randomBulletSpreadArr[this.spreadArrIter] * this.relativeSpread
    };
  }

  step(ms: number): void {
    super.step(ms);
    this.sprite.advance(ms);
  }

  updateSprite() {
    this.behaviors.animation.facingDirection = this.facingRight
      ? SpriteFacingDirection.LEFT
      : SpriteFacingDirection.RIGHT;
  }

  private setTargetEntity() {
    if (this.target && this.targetEntity.type === this.type && this.level) {
      const foundTarget = [...this.level.getEntities().values()].find(
        (e) => e.name === this.target
      );
      if (foundTarget) {
        this.targetEntity = foundTarget;
      } else {
        console.warn(
          'Target named "' + this.target + '" set on',
          this.name,
          this.type,
          "not found in level."
        );
      }
    }
  }

  private faceNearestEnemy() {
    if (!this.level) {
      this.facingRight = !this.facingRight;
      this.updateSprite();
      this.targetEntity = this;
      return;
    }
    let nearestX: number | null = null;
    let nearestDist = Infinity;
    for (const [, entity] of this.level.getEntities()) {
      if (entity.alignment === EntityAlignment.Enemy) {
        const dist = entity.position.distanceTo(this.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestX = entity.position.x;
          this.targetEntity = entity;
        }
      }
    }
    if (nearestX === null) {
      this.targetEntity = this;
      this.facingRight = !this.facingRight;
    } else {
      this.facingRight = nearestX > this.position.x;
    }
    this.updateSprite();
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
