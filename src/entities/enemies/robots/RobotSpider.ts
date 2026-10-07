import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2, Vector3 } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree, AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  ForEach,
  Inverter,
  Selector,
  Sequence,
  Setup
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { DispatchDirectives } from "src/entities/shared/aiNodes/consumerNodes/AIDispatchDirectivesNode";
import { IsDead } from "src/entities/shared/aiNodes/consumerNodes/AIIsDeadNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { MoveAwayPosition } from "src/entities/shared/aiNodes/consumerNodes/AIMoveAwayPosition";
import { MoveToPosition } from "src/entities/shared/aiNodes/consumerNodes/AIMoveToPositionNode";
import { Die } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIDieNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { IsAggroedWithPlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedWithPlayerNode";
import { GetPlayerPosition } from "src/entities/shared/aiNodes/producerNodes/AIGetPlayerPosition";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIPhysicsAnimationDataMap,
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import * as robotSpiderTypes from "../sprites/robot-spider/robot-spider";
import robotSpiderPrs from "../sprites/robot-spider/robot-spider.prs";
import { Drill } from "./Drill";

export type RobotSpiderProps = EntityProps & EnemyProps & { drills?: number };
@addResourceLoader(new ProtoSpriteLoader("RobotSpiderSheet", robotSpiderPrs))
export class RobotSpider extends CoreEntity {
  static readonly type = "RobotSpider";
  public readonly type = RobotSpider.type;
  public alignment = EntityAlignment.Enemy;

  private animationMap: APIPhysicsAnimationDataMap<robotSpiderTypes.sprite_animations> =
    {
      idle: {
        tagName: "idle",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "walk",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      },
      preJump: {
        tagName: "jump",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS,
        startFrame: 1,
        endFrame: 5,
        isLooping: false
      },
      jumpRising: {
        tagName: "jump",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS,
        startFrame: 6,
        endFrame: 7,
        isLooping: false
      },
      jumpFalling: {
        tagName: "jump",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS,
        startFrame: 12,
        endFrame: 13,
        isLooping: false
      },
      postJump: {
        tagName: "jump",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS,
        startFrame: 14,
        endFrame: 18,
        isLooping: false
      }
    };

  public behaviors = {
    ai: new AIBehavior(),
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, 10, 3)
      .setSpeedLimits(4),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior().setMaxHealth(80),
    data: new CentralDataStoreBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 2,
      sightDistance: 10,
      nearbyDistance: 8,
      farDistance: 12,
      trackingTimeoutMs: 3000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: false,
      aggroCooldown: 1000
    }),
    animation: new AnimationControlBehavior<robotSpiderTypes.sprite_animations>(
      this.animationMap
    ),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  public object3D = new Object3D();

  public sprite = getResource<ProtoSpriteSheetThree>(
    RobotSpider,
    "RobotSpiderSheet"
  ).getSprite<
    robotSpiderTypes.sprite_layers,
    robotSpiderTypes.sprite_animations
  >();

  drills = 0;
  drill: Drill[] = [];
  private drillAttack?: number;

  constructor(props: RobotSpiderProps) {
    super(props);

    this.size = {
      width: 1.4,
      height: 1.8
    };

    this.drills = props.drills ?? 3;
    this.drillAttack = props.attack;

    this.sprite.center();
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this).setDensity(0.5);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ?? 80);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);

    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this._setupBehaviorTree();
  }

  step(deltaMs: number) {
    super.step(deltaMs);

    let aggresor = this.behaviors.aggro.resolveCurrentTarget();
    if (aggresor) {
      //this.behaviors.status.debugSetColor(0.1, new Color(255, 0, 0));
      this.behaviors.animation.facingDirection = Math.sign(
        aggresor.position.x - this.position.x
      );
    }

    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
  }

  private startRunning() {
    this.animationMap.walk = {
      tagName: "run",
      flipFacing: true,
      priorityLevel: AnimationPriority.PHYSICS
    };
    this.behaviors.animation.attachSprite(this.sprite);
    this.behaviors.motionCapabilities.setSpeedLimits(5);
  }

  private startWalking() {
    this.animationMap.walk = {
      tagName: "walk",
      flipFacing: true,
      priorityLevel: AnimationPriority.PHYSICS
    };
    this.behaviors.animation.attachSprite(this.sprite);
    this.behaviors.motionCapabilities.setSpeedLimits(2);
  }

  private createDrills(level: EntityLevelAPI) {
    let tries = 0;
    for (let i = 0; i < this.drills; i++) {
      let pos = new Vector3(-2 + Math.random() * 4, Math.random() * 3, 0);

      const ray = new level.rapier.Ray(
        { x: this.position.x, y: this.position.y },
        { x: pos.x, y: pos.y }
      );

      let collided = false;
      level.world.intersectionsWithRay(ray, 1, false, (hit) => {
        const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);

        if (!hitEntityId) return true;
        const hitEntity = level.getEntity(hitEntityId);

        if (!hitEntity || !isAnyTerrain(hitEntity)) return true;

        collided = true;
        return false;
      });

      if (collided) {
        if (tries++ > 10) return false;
        i--;
        continue;
      }

      tries = 0;

      this.drill[i] = new Drill({
        position: pos.add(this.position),
        attack: this.drillAttack
      });
      this.drill[i].spider = this;
      level.addEntity(this.drill[i]);
    }
    return true;
  }

  private _setupBehaviorTree(): void {
    const playerPositionStore = AINode.CreateSharedVariable<Vector2>(
      new Vector2()
    );

    const eachDrill = AINode.CreateSharedVariable<Drill>();

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        Inverter(Setup(Do(() => this.createDrills(this.level!)))),
        Sequence(
          IsDead(),
          ForEach(() => this.drill, eachDrill, undefined,
            DispatchDirectives(eachDrill, { shouldDie: true })
          ),
          Die<robotSpiderTypes.sprite_animations>({
            tagName: "death",
            startFrame: 1,
            isLooping: false,
            priorityLevel: AnimationPriority.CRITICAL
          })
        ),
        Selector(
          Sequence(
            IsAggroedWithPlayer(),
            ForEach(
              () => this.drill,
              eachDrill,
              undefined,
              DispatchDirectives(eachDrill, {
                aggro: true
              })
            ),
            Selector(
              Inverter(GetPlayerPosition(playerPositionStore)),
              Sequence(
                Inverter(IsPlayerInRange(7)),
                Do(() => this.startRunning()),
                Sequence(
                  CancelPathFollowing(),
                  MoveToPosition(playerPositionStore, 6, true)
                ),
                Do(() => this.startWalking())
              ),
              Sequence(
                IsPlayerInRange(3),
                Do(() => this.startRunning()),
                MoveAwayPosition(playerPositionStore, 4),
                Do(() => this.startWalking())
              ),
              GroundPatrol(1, 2, 3500)
            )
          ),
          Sequence(
            ForEach(
              () => this.drill,
              eachDrill,
              undefined,
              DispatchDirectives(eachDrill, {
                aggro: false
              })
            ),
            GroundPatrol(1, 10, 3500)
          )
        )
      )
    );
  }
}
