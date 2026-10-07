// @ts-nocheck
// TODO: FIX THIS FOR ROBERT'S NEW INTRO AND FOR AI SYSTEM CHANGES
import { Vector2 } from "three";

import { AINodeData } from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { ElementalType, EntityLevelEvents, LevelAPI } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Selector,
  Sequence,
  Verify,
  Wait
} from "src/engine/entity/AICoreNodes";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Gnull } from "src/entities/enemies/critters/Gnull";
import { GnullAnimation } from "src/entities/enemies/sprites/gnull/gnull";
import { Marker } from "src/entities/environment/Marker";
import { SolidColorForeground } from "src/entities/environment/SolidColorForeground";
import { IntroSeqTilt } from "src/entities/environment/special/cryo/IntroSeqTilt";
import { PlayerAPI } from "src/entities/player/PlayerAPI";
import { RemoveFromLevel } from "src/entities/shared/aiNodes/consumerNodes/AIRemoveFromLevelNode";
import { HandleDeath } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIHandleDeathNode";
import { AnimationPriority } from "src/entities/shared/behaviors/AnimationControlBehavior";
import { ProjectilePhysicsEvents } from "src/entities/shared/behaviors/ProjectilePhysics";
import { FireballExplosion } from "src/entities/spells/blasts/FireballExplosion";
import { Fireball } from "src/entities/spells/projectiles/Fireball";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";

export const ShortDemo_0: LevelDefinitionAPI = {
  id: "ShortDemo_0",
  mapJson: async () => (await import("../../../tiled/maps/short-demo/short-demo-0.tmj")).default,
  images: {},
  setup: async (level: LevelAPI) => {
    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

    makeBoundariesInvsibile(level);
    setupSpawningEnemies(level);

    const introScreen = level.getEntitiesForType(IntroSeqTilt).at(0)!;
    introScreen.appear();

    const foreground = level.getEntitiesForType(SolidColorForeground).at(0)!;
    foreground.fadeOut(0);

    const cameraDirector = level.cameraDirector;
    const player = getPlayer(level)!;
    player.faceImmediate(false);
    player.behaviors.data.disableControls();

    const initialFireballSequencePromise = initialCastFireballSequence(
      level,
      player
    );

    cameraDirector.pushScriptedRequest(
      {
        center: vector3To2(player.position),
        size: new Vector2(12, 12)
      },
      0
    );

    await cameraDirector.pushScriptedRequest(
      {
        size: new Vector2(5, 5),
        letterboxingPercentage: 1.0
      },
      10000
    );

    await initialFireballSequencePromise;

    const fireball = await castFireball(level, player, true);

    cameraDirector.sendLookAtEntityRequest(
      fireball,
      { lookaheadDistance: 0 },
      0
    );
    cameraDirector.resetScriptedProperties(0, 0, "center");

    await typedEmitterPromise(
      fireball.behaviors.projectilePhysics.events,
      ProjectilePhysicsEvents.CollideWithEntity
    );

    const explosion = new FireballExplosion({
      position: fireball.position.clone(),
      power: 0,
      radius: 5
    });
    level.addEntity(explosion);

    cameraDirector.pushScriptedRequest(
      { shake: 10, distort: 0.7, size: new Vector2(4, 4) },
      0
    );
    cameraDirector.popScriptedRequest(700);

    cameraDirector.pushScriptedRequest(
      { center: vector3To2(fireball.position) },
      0
    );

    await scheduler.asyncTimeout(2500);

    cameraDirector.pushScriptedRequest({ size: new Vector2(6, 6) }, 5000, 0);
  }
};

function setupSpawningEnemies(level: LevelAPI) {
  const enemySpawnMarker =
    level.getEntityForName<Marker>("Enemy Spawn Marker")!;
  const projectileMarker = level.getEntityForName<Marker>("Projectile Marker")!;

  let spawnEnemyTimer = 0;
  let numSpawned = 0;
  level.on(EntityLevelEvents.Step, (deltaMs) => {
    spawnEnemyTimer -= deltaMs;
    if (spawnEnemyTimer > 0) return;

    spawnEnemyTimer = Math.random() * 1000 + 500;
    numSpawned++;

    const gnull = new Gnull({
      position: enemySpawnMarker.position.clone()
    });
    level.addEntity(gnull);

    gnull.behaviors.status.disableHealth();
    if (numSpawned > 10) gnull.behaviors.motionCapabilities.setSpeedLimits(2);

    const nodeData: AINodeData = {
      thisEntity: gnull,
      deltaMs: 0,
      totalMs: 0,
      level: level,
      thisRigidBody: gnull.behaviors.physics.body,
      thisSprite: gnull.sprite
    };

    const randomStopXCoord =
      projectileMarker.position.x + (Math.random() - 0.5) * 5;
    if (numSpawned <= 10) randomStopXCoord + 1;

    const gnullControlEvents = gnull.behaviors.pathFollowing.controlEvents;
    const randomDeathWaitTime = Math.random() * 4000 + 1000;

    // prettier-ignore
    gnull.behaviors.ai.overrideAI(new AIBehaviorTree(nodeData, 
      Selector(
        Sequence(
          HandleDeath<GnullAnimation>({
            tagName: "death_2",
            startFrame: 1,
            isLooping: false,
            priorityLevel: AnimationPriority.CRITICAL
          }, false),
          Wait(30000),
          RemoveFromLevel()
        ),
        Sequence(
          Verify(() => gnull.position.x >= randomStopXCoord),
          Do(() => {
            gnullControlEvents.emit(ControlEvents.MoveHorizontally, 0);
            gnullControlEvents.emit(ControlEvents.Stop);
          }),
          Wait(randomDeathWaitTime),
          Do(() => {
            gnull.die();
            gnull.behaviors.status.markDead();
          })
        ),
        Do(() => 
          gnullControlEvents.emit(ControlEvents.MoveHorizontally, 1)
        )
      )
    ));
  });
}

function makeBoundariesInvsibile(level: LevelAPI): void {
  level
    .getEntitiesForType(BaseTerrain)
    .filter((tile) => tile.layerName === "Boundaries")
    .forEach((boundary) => (boundary.object3D.visible = false));
}

async function castFireball(
  level: LevelAPI,
  player: PlayerAPI,
  finalCast: boolean = false
): Promise<Fireball> {
  const castDeferred = player.doCast({
    elementalType: ElementalType.Fire,
    color: 0xffcc00,
    speed: finalCast ? 0.5 : 1,
    manaCost: 0
  });

  await castDeferred.getPromise();
  level.cameraDirector.pushScriptedRequest(
    { shake: finalCast ? 2.5 : 1.5, distort: finalCast ? 1 : 0.7 },
    0
  );
  level.cameraDirector.popScriptedRequest(finalCast ? 700 : 500);

  const fireball = new Fireball({
    position: player.getCastOrigin()
  });
  if (finalCast) fireball.object3D.scale.multiplyScalar(1.4);
  level.addEntity(fireball);

  const projectileMarker = level.getEntityForName<Marker>("Projectile Marker")!;
  const projectileMarkerPos = vector3To2(projectileMarker.position);

  const neededVelocity =
    fireball.behaviors.projectilePhysics.calculateVelocityToIntercept(
      projectileMarkerPos,
      10
    )!;
  fireball.setVelocity(neededVelocity);

  return fireball;
}

async function initialCastFireballSequence(
  level: LevelAPI,
  player: PlayerAPI
): Promise<void> {
  await castFireball(level, player);
  await castFireball(level, player);
  await castFireball(level, player);
  await castFireball(level, player);
  await castFireball(level, player);
  await castFireball(level, player);

  return;
}
