import { Color, Object3D } from "three";

import { EnemyProps } from "src/api/enemy";
import { EntityAlignment, EntityHitDetails, EntityProps } from "src/api/entity";
import {
  enemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree, AINode } from "src/engine/entity/AIBehaviorTree";
import { Selector, Sequence } from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { Die } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIDieNode";
import { GoombaWalk } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGoombaWalkNode";
import { GetHasBeenKilledHitDetails } from "src/entities/shared/aiNodes/producerNodes/subtrees/AIGetHasBeenKilledHitDetailsNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import { GnullAnimation } from "../sprites/gnull/gnull";
import { DispatchBeeSwarmAggroToNearbyBees } from "./bees/bee-directives";

export type GrubProps = EntityProps &
  EnemyProps & {
    swarmRadius?: number;
  };

@setAssetDependencies(() => ["gnullSprite"])
export class Grub extends CoreEntity {
  static readonly type = "Grub";
  public readonly type = Grub.type;

  public alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 0.5,
    height: 0.5
  };

  public object3D = new Object3D();
  public sprite = getAsset("gnullSprite").getSprite<never, GnullAnimation>();

  /*
   * CONFIGURATION
   */

  private readonly baseSpeed = 1;
  private readonly baseHealth = 1;
  private readonly swarmRadius: number;

  private readonly deathAnimationData: APIAnimationData<GnullAnimation> = {
    tagName: "death_2",
    speedScaler: 5,
    priorityLevel: AnimationPriority.CRITICAL
  };

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(this.baseSpeed, 0),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1),
    collision: new CollisionDamageBehavior(0, 0, 0, 10),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    status: new StatusBehavior(),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<GnullAnimation>({
      walk: {
        tagName: "Run_5_heavy",
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    outOfBounds: new OutOfBoundsBehaviour(),
    ai: new AIBehavior()
  };

  constructor(props: GrubProps) {
    super(props);

    const healthScaler = props.health ? props.health : 1;
    const speedScaler = props.speed ? props.speed : 1;
    this.swarmRadius = props.swarmRadius ? props.swarmRadius : 10;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.fadeAllLayers(new Color(0, 255, 0), 1, true);
    this.sprite.mesh.scale.multiplyScalar(0.3);

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.behaviors.motionCapabilities
      .setSpeedLimits(this.baseSpeed * speedScaler, 0)
      .init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.data.controlEvents);
    this.behaviors.status
      .setMaxHealth(this.baseHealth * healthScaler)
      .init(this)
      .attachProtosSprite(this.sprite);

    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this._stepBehaviorTree();
  }

  private _stepBehaviorTree(): void {
    const hitDetailsThatKilledMeStore =
      AINode.CreateSharedVariable<EntityHitDetails>();

    // prettier-ignore
    this.behaviors.ai
		  .init(this)
		  .behaviorTree = new AIBehaviorTree(
			  Selector(
			    Sequence(
			      GetHasBeenKilledHitDetails(hitDetailsThatKilledMeStore),
			      DispatchBeeSwarmAggroToNearbyBees(() => hitDetailsThatKilledMeStore.value.sourceEntity, this.swarmRadius),
			      Die(this.deathAnimationData)
			    ),
			    GoombaWalk(0.1)
			  )
		  );
  }
}
