import { Object3D, Vector2 } from "three";

import { EntityAlignment, EntityHitDetails, EntityProps } from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Do,
  Selector,
  Sequence,
  Setup
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsDead } from "src/entities/shared/aiNodes/consumerNodes/AIIsDeadNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { Die } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIDieNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { IsAggroedWithPlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedWithPlayerNode";
import { IsPlayerInFront } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsPlayerInFrontNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { Hadouken } from "src/entities/spells/projectiles/Hadouken";

import * as wtsTypes from "../sprites/walker-that-shoot/walker-that-shoot-types";

@setAssetDependencies(() => ["walkerThatShootSprite"])
export class WalkerThatShoot extends CoreEntity {
  static type = "WalkerThatShoot";
  public type = "WalkerThatShoot";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public behaviors = {
    ai: new AIBehavior(),
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(1.5),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    perception: new PerceptionBehavior(),
    aggro: new EnemyAggroBehavior({ aggroCooldown: 5000 }),
    status: new StatusBehavior(),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<wtsTypes.sprite_animations>({
      idle: {
        tagName: "Idle2",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "Walk4",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  public projectileSpeed = 8;
  public projectileDamage = 2;

  public sprite = getAsset("walkerThatShootSprite").getSprite<
    wtsTypes.sprite_layers,
    wtsTypes.sprite_animations
  >();

  constructor(props: EntityProps) {
    super(props);
    this.size = {
      width: 70 * kInvPixelScale,
      height: 36 * kInvPixelScale
    };
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl.init(this);
    this.behaviors.perception.init(this);
    this.behaviors.perception.direction.x = -1;
    this.behaviors.aggro.init(this);
    this.behaviors.status.init(this);
    this.behaviors.outOfBounds.init(this);
    this.behaviors.data.init(this);

    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities);
    this.behaviors.physicsControl.attachControlEvents(
      this.behaviors.pathFollowing.controlEvents
    );

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (entity.alignment === EntityAlignment.Player) {
          entity.hit?.({
            hittingEntity: this,
            sourceEntity: this,
            damage: 1,
            hitImpulse: new Vector2(normal.x > 0 ? 6 : -6, normal.y)
          });
        }
      }
    );

    this.sprite.hideLayers("reference");
    this.sprite.center();
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    const spriteContainer = new Object3D();
    spriteContainer.add(this.sprite.mesh);
    this.object3D.add(spriteContainer);

    this.behaviors.status.attachProtosSprite(this.sprite);
    this.behaviors.animation.init(this).attachSprite(this.sprite);

    this.object3D.position.copy(this.position);

    this._setupBehaviorTree();
  }

  public _fireProjectile(): void {
    const facing = this.behaviors.animation.facingDirection;
    const vel2 = new Vector2(this.projectileSpeed * facing, 0);
    const projectile = new Hadouken({
      position: {
        x: this.position.x + facing * 0.5,
        y: this.position.y,
        z: this.position.z
      }
    });
    projectile.ignoreEntity(this.id);
    projectile.setVelocity(vel2);
    projectile.setGravity(0);
    projectile.setSourceEntity(this);
    projectile.damage = this.projectileDamage;
    this.level?.addEntity(projectile);
  }

  private _setupBehaviorTree(): void {
    this.behaviors.ai.init(this).behaviorTree = new AIBehaviorTree(
      Selector(
        Sequence(
          IsDead(),
          Die<wtsTypes.sprite_animations>({
            tagName: "death",
            isLooping: false,
            flipFacing: true,
            priorityLevel: AnimationPriority.CRITICAL
          })
        ),
        Sequence(
          IsAggroedWithPlayer(),
          Setup(
            Do(() => this.behaviors.motionCapabilities.setSpeedLimits(2.5))
          ),
          Selector(
            Sequence(
              IsPlayerInFront(Math.PI / 2),
              IsPlayerInRange(8),
              Debounce(
                1500,
                ScopeWithAnimation<wtsTypes.sprite_animations>(
                  {
                    tagName: "attack",
                    isLooping: false,
                    flipFacing: true,
                    priorityLevel: AnimationPriority.ACTION
                  },
                  Sequence(
                    CancelPathFollowing(),
                    WaitForAnimationFrame(2),
                    Do(() => this._fireProjectile()),
                    WaitForAnimationLoop()
                  )
                )
              )
            ),
            ChasePlayer(3)
          )
        ),
        Sequence(
          Do(() => this.behaviors.motionCapabilities.setSpeedLimits(1.5)),
          GroundPatrol(1, 5, 1000)
        )
      )
    );
  }

  step(ms: number) {
    super.step(ms);
    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
  }

  hit(hit: EntityHitDetails) {
    super.hit(hit);
    if (hit.hitImpulse) {
      this.behaviors.physics.body?.applyImpulse(hit.hitImpulse, true);
    }
  }
}
