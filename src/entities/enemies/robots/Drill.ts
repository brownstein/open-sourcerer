import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import { AINodeData } from "src/api/ai";
import { EnemyProps } from "src/api/enemy";
import { EntityAlignment, EntityProps } from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Do,
  Inverter,
  MemoSelector,
  ParallelSelector,
  Random,
  Selector,
  Sequence,
  Succeeder,
  Verify,
  VerifyDirective,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { getPlayer } from "src/engine/util/levelUtil";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsDead } from "src/entities/shared/aiNodes/consumerNodes/AIIsDeadNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { MoveToPosition } from "src/entities/shared/aiNodes/consumerNodes/AIMoveToPositionNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { ApplyImpulse } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIApplyImpulseNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { Die } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIDieNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import * as drillTypes from "../sprites/drill/drill";
import drillPrs from "../sprites/drill/drill.prs";
import { RobotSpider } from "./RobotSpider";

export type DrillProps = EntityProps & EnemyProps & {};
@addResourceLoader(new ProtoSpriteLoader("drillSheet", drillPrs))
export class Drill extends CoreEntity {
  static readonly type = "Drill";
  public readonly type = Drill.type;
  public alignment = EntityAlignment.Enemy;

  attackDamage = 8;
  touchDamage = 1;

  public behaviors = {
    ai: new AIBehavior<{ aggro: boolean; shouldDie: boolean }>(),
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true)
      .setFly(true)
      .setSpeedLimits(4),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1),
    collision: new CollisionDamageBehavior(this.touchDamage, 4),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior().setMaxHealth(40),
    data: new CentralDataStoreBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 2,
      sightDistance: 10,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 3000
    }),
    animation: new AnimationControlBehavior<drillTypes.sprite_animations>({
      idle: {
        tagName: "idle",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "idle",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  object3D = new Object3D();

  public sprite = getResource<ProtoSpriteSheetThree>(
    Drill,
    "drillSheet"
  ).getSprite<drillTypes.sprite_layers, drillTypes.sprite_animations>();

  public spider: RobotSpider | null = null;

  public messageLog: string[] = [];

  constructor(props: DrillProps) {
    super(props);

    this.size = {
      width: 1.4,
      height: 0.7
    };

    this.attackDamage = props.attack ? props.attack : 8;

    this.sprite.hideLayers("background");
    this.sprite.hideLayers("pj");

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
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.status.setMaxHealth(props.health ?? 40);
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics
      .init(this)
      .setDensity(2)
      .setGravityScale(0)
      .setRotateObject3D(spriteContainer);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl)
      .setSourceRigidBody(this.behaviors.physics.body);

    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this._setupBehaviorTree();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);
    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;

    let pointing = false;

    if (this.behaviors.ai.readDirective("aggro")) pointing = true;

    if (this.sprite && this.level) {
      const player = getPlayer(this.level);
      if (player) {
        let v = 0;
        if (player && pointing) {
          const xscale = this.behaviors.animation.facingDirection;
          v = Math.atan2(
            (player.position.y - this.position.y) * xscale,
            (player.position.x - this.position.x) * xscale
          );
        }
        let diff = ((((v - this.angle) % 360) + 540) % 360) - 180;
        this.angle += diff / 2;

        this.behaviors.physics.body?.setRotation(this.angle, true);
      }
    }
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }

  private _setupBehaviorTree(): void {
    const attackImpulse = new Vector2();

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      ParallelSelector(
        WaitUntilSuccess(
          Sequence(
            Selector(IsDead(), VerifyDirective("shouldDie")),
            Die<drillTypes.sprite_animations>({
              tagName: "death",
              startFrame: 1,
              isLooping: false,
              priorityLevel: AnimationPriority.CRITICAL
            })
          )
        ),
        WaitUntilSuccess(
          Inverter(
            Succeeder(
              Selector(
                Sequence(
                  VerifyDirective("aggro"),
                  Selector(
                    Sequence(
                      IsPlayerInRange(3.5),
                      Debounce(
                        1000,
                        Sequence(
                          CancelPathFollowing(),
                          MemoSelector(
                            Random(0.5),
                            Inverter(Wait(1000)),
                            Inverter(CancelPathFollowing()),
                            ScopeWithAnimation<drillTypes.sprite_animations>(
                              {
                                tagName: "attack",
                                startFrame: 1,
                                isLooping: false,
                                priorityLevel: AnimationPriority.ACTION
                              },
                              Sequence(
                                WaitForAnimationFrame(6),
                                Do(() => {
                                  this.behaviors.collision.updateDamage(this.attackDamage);
                                }),
                                Do((data: AINodeData) => {
                                  if (!data.player) return;

                                  attackImpulse
                                    .subVectors(data.player.position, this.position)
                                    .normalize()
                                    .multiplyScalar(20);
                                }),
                                ApplyImpulse(() => attackImpulse),
                                WaitForAnimationFrame(12),
                                Do(() => {
                                  this.behaviors.collision.updateDamage(this.touchDamage);
                                })
                              )
                            )
                          )
                        )
                      )
                    ),
                    Sequence(
                      Do(() => {
                        this.behaviors.collision.updateDamage(this.touchDamage);
                      }),
                      ChasePlayer(2)
                    )
                  )
                ),
                Sequence(
                  Verify(
                    () =>
                      this.position.distanceToSquared(
                        this.spider?.position ?? this.position
                      ) > 3
                  ),
                  CancelPathFollowing(),
                  MoveToPosition(
                    () =>
                      new Vector2(
                        this.spider?.position.x ?? this.position.x,
                        this.spider?.position.y ?? this.position.y
                      ),
                    1,
                    true
                  )
                ),
                GroundPatrol(1, 2, 3500)
              )
            )
          )
        )
      )
    );
  }
}
