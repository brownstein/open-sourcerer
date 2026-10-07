import { Object3D, Texture, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import {
  enemyBackgroundCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import spawnerGateJson from "../sprites/spawners/spawner_gate.json";
import spawnerGatePng from "../sprites/spawners/spawner_gate.png";
import spawnerHiveJson from "../sprites/spawners/spawner_hive.json";
import spawnerHivePng from "../sprites/spawners/spawner_hive.png";
import spawnerNestJson from "../sprites/spawners/spawner_nest.json";
import spawnerNestPng from "../sprites/spawners/spawner_nest.png";

export type SpawnerProps = EntityProps & {
  entityType?: string;
  spawnFrequency?: number;
  spawnCount?: number;
};

@addResourceLoader(
  new TextureResourceLoader("spawnerGateTexture", spawnerGatePng)
)
export class Spawner extends CoreEntity {
  static type = "Spawner";
  public type = "Spawner";
  public object3D = new Object3D();

  public alignment = EntityAlignment.Enemy;
  public dead = false;

  public entityType = "Slime";
  public spawnFrequency = 5000;
  public spawnCount = 3;

  public behaviors = {
    status: new StatusBehavior(),
    physics: new CharacterPhysicsBehavior().setGroup(
      enemyBackgroundCollisionGroup
    )
  };

  private sprite = new ThreeAseprite({
    texture: getResource<Texture>(Spawner, "spawnerGateTexture"),
    sourceJSON: spawnerGateJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  private activeSpawnedEntityIds = new Set<string>();
  private isBig = true;
  private spawning = false;
  private opening = false;
  private animationCompleted = false;

  constructor(props: SpawnerProps) {
    super(props);
    this.entityType = props.entityType ?? this.entityType;
    this.spawnFrequency = props.spawnFrequency ?? this.spawnFrequency;
    this.spawnCount = props.spawnCount ?? this.spawnCount;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    this.sprite.mesh.position.z--;

    if (this.size.width < 3) {
      this.isBig = false;
      this.sprite.gotoTag("S Open");
      this.sprite.gotoTagFrame(0);
      this.sprite.setOffset(new Vector2(8, -8));
      this.sprite.playingAnimation = false;
    } else {
      this.sprite.gotoTag("B Open");
      this.sprite.playingAnimation = false;
    }
    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      this.animationCompleted = true;
    });

    this.scheduler.add({
      id: "spawnInterval",
      duration: this.spawnFrequency,
      recurring: true,
      invokeFunctionAtComplete: () => {
        for (const entityId of this.activeSpawnedEntityIds) {
          if (!this.level?.getEntity(entityId))
            this.activeSpawnedEntityIds.delete(entityId);
        }
        if (this.activeSpawnedEntityIds.size >= this.spawnCount) return;
        this.queueSpawnEntity();
      }
    });

    this.behaviors.physics.init(this);
    this.behaviors.status.init(this).attachSprite(this.sprite);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.spawning = false;
      this.opening = false;
      this.dead = true;
      this.sprite.gotoTag(this.isBig ? "B Dest" : "S Dest");
      this.sprite.playingAnimation = true;
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
    });
  }
  queueSpawnEntity() {
    if (this.spawning || this.dead) return;
    this.spawning = true;
    this.opening = true;
    this.sprite.playingAnimation = true;
    this.sprite.gotoTag(this.isBig ? "B Open" : "S Open");
    this.sprite.gotoTagFrame(0);
  }
  async spawnEntity() {
    const entity = await this.level?.constructEntityAfterPreload(
      this.entityType,
      {
        position: this.position.clone()
      }
    );
    if (!entity) return;
    this.activeSpawnedEntityIds.add(entity.id);
    this.level?.addEntity(entity);
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms * 2.5);
    if (this.animationCompleted) {
      this.animationCompleted = false;
      if (this.dead) {
        this.sprite.gotoTagFrame(this.isBig ? 7 : 6);
        this.sprite.playingAnimation = false;
      } else if (this.spawning) {
        if (this.opening) {
          this.sprite.gotoTag(this.isBig ? "B Close" : "S Close");
          this.opening = false;
          this.spawnEntity();
        } else {
          this.sprite.gotoTag(this.isBig ? "B Open" : "S Open");
          this.sprite.playingAnimation = false;
          this.spawning = false;
          this.opening = false;
        }
      }
    }
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}

@addResourceLoader(
  new TextureResourceLoader("spawnerNestTexture", spawnerNestPng)
)
export class NestSpawner extends CoreEntity {
  static type = "NestSpawner";
  public type = "NestSpawner";
  public object3D = new Object3D();

  public alignment = EntityAlignment.Enemy;
  public dead = false;

  public entityType = "Slime";
  public spawnFrequency = 5000;
  public spawnCount = 3;

  public behaviors = {
    status: new StatusBehavior(),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyBackgroundCollisionGroup)
      .setGravityScale(0)
      .setDensity(0)
  };

  private sprite = new ThreeAseprite({
    texture: getResource<Texture>(NestSpawner, "spawnerNestTexture"),
    sourceJSON: spawnerNestJson,
    frameName: ({ frame }) => `${frame}`,
    layers: [""]
  });
  private activeSpawnedEntityIds = new Set<string>();
  private spawning = false;

  constructor(props: SpawnerProps) {
    super(props);
    this.entityType = props.entityType ?? this.entityType;
    this.spawnFrequency = props.spawnFrequency ?? this.spawnFrequency;
    this.spawnCount = props.spawnCount ?? this.spawnCount;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    this.sprite.mesh.position.z--;

    this.sprite.gotoTag("Idle");
    this.sprite.playingAnimation = true;
    this.sprite.addTagFrameTrigger("Spawn", 5, "spawn");
    this.sprite.addEventListener("spawn", this.spawnEntity.bind(this));
    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.sprite.getCurrentTag() === "Spawn") {
        this.sprite.gotoTag("Idle");
        this.spawning = false;
      }
      if (this.sprite.getCurrentTag() === "Destroy") {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });

    this.scheduler.add({
      id: "spawnInterval",
      duration: this.spawnFrequency,
      recurring: true,
      invokeFunctionAtComplete: () => {
        for (const entityId of this.activeSpawnedEntityIds) {
          if (!this.level?.getEntity(entityId))
            this.activeSpawnedEntityIds.delete(entityId);
        }
        if (this.activeSpawnedEntityIds.size >= this.spawnCount) return;
        this.queueSpawnEntity();
      }
    });

    this.behaviors.physics.init(this);
    this.behaviors.status.init(this).attachSprite(this.sprite);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.spawning = false;
      this.dead = true;
      this.sprite.gotoTag("Destroy");
      this.sprite.playingAnimation = true;
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
    });
  }
  queueSpawnEntity() {
    if (this.spawning || this.dead) return;
    this.spawning = true;
    this.sprite.gotoTag("Spawn");
    this.sprite.playingAnimation = true;
  }
  async spawnEntity() {
    const position = this.position.clone();
    position.y -= 0.9;
    const entity = await this.level?.constructEntityAfterPreload(
      this.entityType,
      {
        position
      }
    );
    if (!entity) return;
    this.activeSpawnedEntityIds.add(entity.id);
    this.level?.addEntity(entity);
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}

@addResourceLoader(
  new TextureResourceLoader("spawnerHiveTexture", spawnerHivePng)
)
export class HiveSpawner extends CoreEntity {
  static type = "HiveSpawner";
  public type = "HiveSpawner";
  public object3D = new Object3D();

  public alignment = EntityAlignment.Enemy;
  public dead = false;

  public entityType = "Bee";
  public spawnFrequency = 5000;
  public spawnCount = 3;

  public behaviors = {
    status: new StatusBehavior(),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyBackgroundCollisionGroup)
      .setGravityScale(0)
      .setDensity(0)
  };

  private sprite = new ThreeAseprite({
    texture: getResource<Texture>(HiveSpawner, "spawnerHiveTexture"),
    sourceJSON: spawnerHiveJson,
    frameName: ({ frame }) => `${frame}`,
    layers: [""]
  });
  private activeSpawnedEntityIds = new Set<string>();
  private spawning = false;

  constructor(props: SpawnerProps) {
    super(props);
    this.entityType = props.entityType ?? this.entityType;
    this.spawnFrequency = props.spawnFrequency ?? this.spawnFrequency;
    this.spawnCount = props.spawnCount ?? this.spawnCount;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    this.sprite.mesh.position.z--;

    this.sprite.gotoTag("Idle");
    this.sprite.playingAnimation = true;
    this.sprite.addTagFrameTrigger("Spawn", 4, "spawn");
    this.sprite.addEventListener("spawn", this.spawnEntity.bind(this));
    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.sprite.getCurrentTag() === "Spawn") {
        this.sprite.gotoTag("Idle");
        this.spawning = false;
      }
      if (this.sprite.getCurrentTag() === "Destroy") {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });

    this.scheduler.add({
      id: "spawnInterval",
      duration: this.spawnFrequency,
      recurring: true,
      invokeFunctionAtComplete: () => {
        for (const entityId of this.activeSpawnedEntityIds) {
          if (!this.level?.getEntity(entityId))
            this.activeSpawnedEntityIds.delete(entityId);
        }
        if (this.activeSpawnedEntityIds.size >= this.spawnCount) return;
        this.queueSpawnEntity();
      }
    });

    this.behaviors.physics.init(this);
    this.behaviors.status.init(this).attachSprite(this.sprite);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.spawning = false;
      this.dead = true;
      this.sprite.gotoTag("Destroy");
      this.sprite.playingAnimation = true;
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
    });
  }
  queueSpawnEntity() {
    if (this.spawning || this.dead) return;
    this.spawning = true;
    this.sprite.gotoTag("Spawn");
    this.sprite.playingAnimation = true;
  }
  async spawnEntity() {
    const position = this.position.clone();
    position.y -= 0.9;
    const entity = await this.level?.constructEntityAfterPreload(
      this.entityType,
      {
        position
      }
    );
    if (!entity) return;
    this.activeSpawnedEntityIds.add(entity.id);
    this.level?.addEntity(entity);
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
