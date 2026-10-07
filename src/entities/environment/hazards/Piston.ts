import {
  Collider,
  ColliderDesc,
  RigidBody,
  RigidBodyDesc
} from "@dimforge/rapier2d-compat";
import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import {
  Box2,
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Texture,
  Vector2,
  Vector3
} from "three";

import {
  BaseEntityType,
  DamageType,
  EntityAlignment,
  type EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityLifecycleEvents,
  type EntityProps
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { approxEqual } from "src/util/mathUtils";
import { getNormalBetweenRigidBodies } from "src/util/physicsUtils";
import { extractTextureFromLayer, isolateLayer } from "src/util/spriteUtils";

import pistonSpikePrs from "../sprites/pistons/piston-spike.prs";
import pistonThinPrs from "../sprites/pistons/piston-thin.prs";
import type {
  SpikePistonAnimation,
  SpikePistonLayer,
  ThinPistonAnimation,
  ThinPistonLayer,
  WidePistonAnimation,
  WidePistonLayer
} from "../sprites/pistons/piston-types";
import pistonWidePrs from "../sprites/pistons/piston-wide.prs";

type ThinSprite = ProtoSpriteThree<ThinPistonLayer, ThinPistonAnimation> & {
  readonly variant: "thin";
};
type WideSprite = ProtoSpriteThree<WidePistonLayer, WidePistonAnimation> & {
  readonly variant: "wide";
};
type SpikeSprite = ProtoSpriteThree<SpikePistonLayer, SpikePistonAnimation> & {
  readonly variant: "spike";
};

// the added .variant member is used for type guarding
type PistonSprite = ThinSprite | WideSprite | SpikeSprite;

type PistonVariant = "thin" | "wide" | "spike";

export type PistonProps = EntityProps & {
  variant?: PistonVariant;
  offsetTime?: number;
  idleTime?: number;
  timeBetweenThrustsMs?: number;
  animationSpeed?: number;
  extensionSpeed?: number;
  impactTime?: number;
  retractionSpeed?: number;
  controlled?: boolean;
  programmable?: boolean;
  hasTilingShaft?: boolean;
  hideContrails?: boolean;
  hideImpactEffects?: boolean;
  channel?: string;
  channelInverted?: boolean;
};

export enum PistonEvents {
  ExtensionCompleted = "ExtensionCompleted",
  RetractionCompleted = "RetractionCompleted"
}

type PistonEventTypes = {
  [PistonEvents.ExtensionCompleted]: void;
  [PistonEvents.RetractionCompleted]: void;
};

@addResourceLoader(new ProtoSpriteLoader("pistonWideSheet", pistonWidePrs))
@addResourceLoader(new ProtoSpriteLoader("pistonThinSheet", pistonThinPrs))
@addResourceLoader(new ProtoSpriteLoader("pistonSpikeSheet", pistonSpikePrs))
export class Piston extends CoreEntity {
  static readonly type = "Piston";
  public readonly type = Piston.type;
  public readonly alignment = EntityAlignment.EnvironmentalHazard;
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & PistonEventTypes
  >();
  public object3D = new Object3D();

  // used in some calculations that have margins of errors
  private readonly epsilon = 0.0001;

  // determines whether the piston will be scaled vertically or given an infinitely tiling shaft
  private hasTilingShaft: boolean = false;
  // a copy of the piston seperated into its main parts is made for the programmatic animations of a tiling piston
  private pistonCopyParts?: {
    readonly bodySprite: ProtoSpriteThree;
    readonly shaftMesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
    readonly shaftTexture: Texture;
    readonly headSprite: ProtoSpriteThree;
    readonly spikeSprite?: ProtoSpriteThree;
    readonly group: Group;
    readonly shaftGroup: Group;
    readonly headGroup: Group;
    readonly maxShaftLength: number;
    currentLength: number;
  };
  private showingCopy: boolean = false;
  private static shaftTextureCache = new Map<PistonVariant, Texture>();

  public offsetTime: number;
  public idleTime: number;
  public timeBetweenThrustsMs: number;
  public impactTime: number;

  // used only if the piston has a tiling shaft
  public extensionSpeed: number;
  public animationSpeed: number;
  public retractionSpeed: number;

  private sprite: PistonSprite;
  private state:
    | "idle"
    | "loading"
    | "extending"
    | "impacting"
    | "retracting"
    | undefined = undefined;

  // for collisions with the piston head
  // the rigid body is decoupled from the visual piston head for collisions to work properly
  // velocity is capped or else tunneling will start to happen
  private readonly MAX_VELOCITY = kPixelScale * 0.3;
  private velocity = this.MAX_VELOCITY;
  private desiredPistonHeadBox: Box3 = new Box3();
  private currentPistonHeadCoords: Vector3 = new Vector3();
  private pistonHeadSize: Vector3 = new Vector3();
  private desiredPistonSpikeBox: Box3 = new Box3();
  private pistonSpikeSize: Vector3 = new Vector3();
  private channel?: string;
  private channelInverted = false;
  private channelUnSub?: () => void;
  private channelActive = false;
  private programmable = false;
  private _autoCycle = false;

  public get canBindToVariable() {
    return this.programmable;
  }

  public bindingPrefix = "piston";

  public extraSpellBindingData() {
    return {
      state: this.state ?? "idle",
      extended: this.state === "impacting",
      timeBetweenThrustsMs: this.timeBetweenThrustsMs
    };
  }

  private collisionNormal?: Vector2;
  // value from 0 to 1 determining how lenient squshing detection should be
  // (for example, entity shouldn't be squished if its getting presssed against a very shallow slope)
  private readonly SQUISHING_LENIENCY = 0.5;

  // used for calculating the direction facing since the piston sprite begins facing up
  private readonly ANGLE_OFFSET = Math.PI / 2;
  private readonly startingDirectionUnitVector: Vector2 = new Vector2();
  private directionUnitVector: Vector2 = new Vector2();

  private rigidBody?: RigidBody;
  private spikeSensor?: Collider;
  private collider?: Collider;

  constructor(props: PistonProps) {
    super(props);

    this.offsetTime = props.offsetTime ?? 0;
    this.idleTime = props.idleTime ?? 0;
    this.timeBetweenThrustsMs = props.timeBetweenThrustsMs ?? 5000;
    this.impactTime = props.impactTime ?? 0;

    this.animationSpeed = props.animationSpeed ? props.animationSpeed : 1;
    this.extensionSpeed = props.extensionSpeed
      ? props.extensionSpeed * kPixelScale
      : kPixelScale;
    this.retractionSpeed = props.retractionSpeed
      ? props.retractionSpeed * kPixelScale
      : kPixelScale;

    const variant = props.variant ?? "wide";

    // we can now use this.sprite.variant to type guard what kind of sprite layers/animations we have
    this.sprite = this._obtainSpriteVariant(variant);

    // WARN: centering should be done before hiding the piston_bounds layer so it accurately centers on the extended piston
    this.sprite.center();

    this.hasTilingShaft =
      props.hasTilingShaft ?? variant === "spike" ? true : false;

    const shouldHideContrails =
      props.hideContrails ?? this.hasTilingShaft ? true : false;

    const shouldHideImpactEffects =
      props.hideImpactEffects ?? this.hasTilingShaft ? true : false;

    if (shouldHideContrails) this.sprite.hideLayers("contrails");
    if (shouldHideImpactEffects) this.sprite.hideLayers("impact_effects");

    if (this.hasTilingShaft) this._constructPistonCopy();

    this.object3D.add(this.sprite.mesh);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this._alignWithTiledSelection();

    this._processInitialCalculations();

    this.channel = props.channel;
    this.channelInverted = props.channelInverted ?? false;
    this.programmable = props.programmable ?? false;

    // begin state loop
    this.sprite.setAnimationLooping(false);
    if (props.controlled || this.programmable || this.channel) return;

    this.scheduler.add({
      duration: this.offsetTime,
      invokeFunctionAtComplete: () => this.start()
    });
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    if (this.state === undefined) return;
    if (this.state !== "idle")
      this.sprite.advance(deltaMs * this.animationSpeed);

    this._calculateDesiredBoxes();
    this._moveRigidBodyTowardsDesiredCoords(deltaMs);
  }

  start(): void {
    this._autoCycle = true;
    this.idle();
  }

  stop(): void {
    this._autoCycle = false;
    this.sprite.events.removeAllListeners();
    this.scheduler.cancelAll();
    this.scheduler.removeAllListeners();
    this.state = undefined;
  }

  idle(): void {
    this.state = "idle";
    this._hideCopy();
    this.setVelocity(1);
    this.sprite.gotoFrame(0);

    if (!this._autoCycle) return;

    this.scheduler.add({
      duration: this.idleTime,
      invokeFunctionAtComplete: () => this.load()
    });
  }

  load(): void {
    this.state = "loading";
    this.setVelocity(kPixelScale / 8);
    this._hideCopy();
    this.sprite.gotoAnimation("loading");

    this.sprite.events.once("animationLooped", () => this.extend());
  }

  extend(): void {
    if (this.state === "extending" || this.state === "impacting") return;
    this.state = "extending";
    this.setVelocity(this.MAX_VELOCITY * this.extensionSpeed);
    this.directionUnitVector.copy(this.startingDirectionUnitVector);
    this._showCopy();
    if (!this.hasTilingShaft) {
      this.sprite.gotoAnimation("extending");
      this.sprite.events.once("animationLooped", () => this.impact());
      return;
    }

    this.events.on(EntityLifecycleEvents.Step, (deltaMs) =>
      this._handleManualExtension(deltaMs)
    );

    this.events.once(PistonEvents.ExtensionCompleted, () => {
      this.events.removeAllListeners(EntityLifecycleEvents.Step);
      this.impact();
    });
  }

  impact(): void {
    this.state = "impacting";
    this.setVelocity(1);
    this._showCopy();

    if (!this._autoCycle) {
      if (!this.hasTilingShaft) {
        this.sprite.gotoAnimation("impacting");
      }
      return;
    }

    // only once the animation is finished and the configured impact time is done will we proceed
    let shouldProceed: boolean = false;

    if (!this.hasTilingShaft) {
      this.sprite.gotoAnimation("impacting");
      this.sprite.events.once("animationLooped", () => {
        if (shouldProceed) this.retract();
        shouldProceed = true;
      });
    } else shouldProceed = true;

    this.scheduler.add({
      duration: this.impactTime,
      invokeFunctionAtComplete: () => {
        if (shouldProceed) this.retract();
        shouldProceed = true;
      }
    });
  }

  retract(): void {
    if (this.state === "retracting" || this.state === "idle") return;
    this.state = "retracting";
    this.setVelocity(this.MAX_VELOCITY * this.retractionSpeed);
    this.directionUnitVector
      .copy(this.startingDirectionUnitVector)
      .multiplyScalar(-1);
    this._showCopy();
    if (!this.hasTilingShaft) {
      if (this.sprite.variant === "spike") {
        this._scheduleIdle();
        return;
      }

      this.sprite.gotoAnimation("retracting");
      this.sprite.events.once("animationLooped", () => this._scheduleIdle());
      return;
    }

    this.events.on(EntityLifecycleEvents.Step, (deltaMs) =>
      this._handleManualRetraction(deltaMs)
    );

    this.events.once(PistonEvents.RetractionCompleted, () => {
      this.events.removeAllListeners(EntityLifecycleEvents.Step);
      this._scheduleIdle();
    });
  }

  setTimeBetweenThrustsMs(value: number): void {
    this.timeBetweenThrustsMs = value;
  }

  setVelocity(velocity: number): void {
    this.velocity = Math.min(velocity, this.MAX_VELOCITY);
  }

  private _scheduleIdle(): void {
    if (this.timeBetweenThrustsMs > 0) {
      this.scheduler.add({
        duration: this.timeBetweenThrustsMs,
        invokeFunctionAtComplete: () => this.idle()
      });
    } else {
      this.idle();
    }
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    if (this.channel) {
      this.channelUnSub = level.state.subValue(this.channel, (active) => {
        const shouldBeActive = !!active !== this.channelInverted;
        if (shouldBeActive && !this.channelActive) {
          this.channelActive = true;
          this.start();
        } else if (!shouldBeActive && this.channelActive) {
          this.channelActive = false;
          this.stop();
        }
      });
    }

    const { world } = level;

    const bodyDescription = RigidBodyDesc.kinematicPositionBased()
      .setTranslation(
        this.currentPistonHeadCoords.x,
        this.currentPistonHeadCoords.y
      )
      .setRotation(this.angle)
      .setCcdEnabled(true);

    this.rigidBody = world.createRigidBody(bodyDescription);

    const colliderDesription = ColliderDesc.cuboid(
      this.pistonHeadSize.x / 2,
      this.pistonHeadSize.y / 2
    ).setCollisionGroups(terrainCollisionGroup);

    this.collider = world.createCollider(colliderDesription, this.rigidBody);

    if (this.sprite.variant === "spike") {
      const spikeSensorDescription = ColliderDesc.cuboid(
        (this.pistonSpikeSize.x / 2) * 0.9,
        (this.pistonSpikeSize.y / 2) * 0.5
      ).setTranslation(0, this.pistonHeadSize.y / 2);

      this.spikeSensor = world.createCollider(
        spikeSensorDescription,
        this.rigidBody
      );
    }

    const colliders = [this.collider.handle];
    if (this.spikeSensor) colliders.push(this.spikeSensor.handle);

    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.rigidBody.handle,
      colliderHandles: colliders,
      beginCollision: (_this, otherEntity, normal, thisHandle) => {
        this.collisionNormal = normal;

        // deal spike damage before calculating lethal damage
        if (
          this.spikeSensor &&
          this.spikeSensor.handle === thisHandle &&
          otherEntity &&
          otherEntity.hit
        ) {
          otherEntity.hit({
            hittingEntity: this,
            sourceEntity: this,
            damage: 5,
            damageType: DamageType.Pierce,
            hitImpulse: new Vector2()
              .copy(this.collisionNormal)
              .multiplyScalar(Math.min(this.extensionSpeed, kPixelScale))
          });
        }

        if (this.state !== "extending" && this.state !== "retracting")
          return CollisionBehavior.Collide;

        // inhibit damage done if entity is not directly in pistons direction of movement (feels alot better)
        const collisionAndPistonDirectionDot = new Vector2()
          .copy(this.directionUnitVector)
          .dot(this.collisionNormal);

        if (!approxEqual(collisionAndPistonDirectionDot, 1, this.epsilon))
          return CollisionBehavior.Collide;

        return CollisionBehavior.Callback;
      },
      handleOngoingCollision: (otherEntity, otherRigidBody) =>
        this._determinePistonDamageOn(otherEntity, otherRigidBody)
    });
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.rigidBody) level.world.removeRigidBody(this.rigidBody);
    this.channelUnSub?.();
    this.channelUnSub = undefined;
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.pistonCopyParts?.bodySprite.dispose();
    this.pistonCopyParts?.headSprite.dispose();
    this.pistonCopyParts?.spikeSprite?.dispose();
    this.pistonCopyParts?.shaftMesh.geometry.dispose();
    this.pistonCopyParts?.shaftMesh.material.dispose();
    this.pistonCopyParts?.shaftTexture.dispose();
  }

  private _calculateDesiredBoxes(): void {
    this.object3D.updateMatrixWorld();

    if (this.showingCopy && this.pistonCopyParts && this.hasTilingShaft) {
      const headMesh = this.pistonCopyParts.headSprite.mesh;
      headMesh.updateMatrixWorld();

      this.desiredPistonHeadBox.setFromObject(headMesh);

      if (this.pistonCopyParts.spikeSprite) {
        const spikeMesh = this.pistonCopyParts.spikeSprite.mesh;
        spikeMesh.updateMatrixWorld();

        this.desiredPistonSpikeBox.setFromObject(spikeMesh);
      }

      return;
    }

    let pistonHeadBox2: Box2 = this.sprite.getLayerBounds("head");
    this.desiredPistonHeadBox.min.set(
      pistonHeadBox2.min.x,
      pistonHeadBox2.min.y,
      0
    );
    this.desiredPistonHeadBox.max.set(
      pistonHeadBox2.max.x,
      pistonHeadBox2.max.y,
      0
    );
    this.desiredPistonHeadBox.applyMatrix4(this.object3D.matrixWorld);

    if (this.sprite.variant === "spike") {
      let pistonSpikeBox2: Box2 = this.sprite.getLayerBounds("spikes");
      this.desiredPistonSpikeBox.min.set(
        pistonSpikeBox2.min.x,
        pistonSpikeBox2.min.y,
        0
      );
      this.desiredPistonSpikeBox.max.set(
        pistonSpikeBox2.max.x,
        pistonSpikeBox2.max.y,
        0
      );

      this.desiredPistonSpikeBox.applyMatrix4(this.object3D.matrixWorld);
    }
  }

  private _moveRigidBodyTowardsDesiredCoords(deltaMs: number): void {
    if (!this.rigidBody) return;

    const desiredPistonHeadCoords = this.desiredPistonHeadBox.getCenter(
      new Vector3()
    );
    if (this.currentPistonHeadCoords.equals(desiredPistonHeadCoords)) return;

    const maxVelocity = (this.velocity * deltaMs) / 1000;

    // linalg so goated
    const targetDelta = desiredPistonHeadCoords.sub(
      this.currentPistonHeadCoords
    );

    const movementDelta = new Vector3()
      .copy(targetDelta)
      .normalize()
      .multiplyScalar(maxVelocity)
      .clampLength(0, targetDelta.length());

    this.currentPistonHeadCoords.add(movementDelta);

    this.rigidBody.setNextKinematicTranslation({
      x: this.currentPistonHeadCoords.x,
      y: this.currentPistonHeadCoords.y
    });
  }

  private _determinePistonDamageOn(
    entity: BaseEntityType,
    rigidBody: RigidBody
  ): void {
    if (!this.level || !this.collisionNormal) return;

    const level = this.level;
    const { world } = level;

    const collidingTerrainRigidBodies = level
      .getRigidBodiesCollidingWith(rigidBody.handle)
      .map((handle) => world.getRigidBody(handle))
      .filter((rigidBody) => {
        const associatedEntity = level.getEntityForRigidBody(rigidBody.handle);
        return associatedEntity && isTerrain(associatedEntity);
      });

    for (const terrainRigidBody of collidingTerrainRigidBodies) {
      const entityNormalWithTerrain = getNormalBetweenRigidBodies(
        rigidBody,
        terrainRigidBody,
        world
      );
      if (!entityNormalWithTerrain) continue;

      const pistonAndTerrainDot = new Vector2()
        .copy(this.collisionNormal)
        .dot(entityNormalWithTerrain);

      if (
        pistonAndTerrainDot < -this.SQUISHING_LENIENCY ||
        pistonAndTerrainDot > this.SQUISHING_LENIENCY
      ) {
        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this,
          damage: 9999,
          damageType: DamageType.Force
        });
      }
    }
  }

  private _showCopy(): void {
    if (!this.hasTilingShaft || !this.pistonCopyParts) return;
    this.sprite.mesh.visible = false;
    this.pistonCopyParts.group.visible = true;
    this.showingCopy = true;
  }

  private _hideCopy(): void {
    if (!this.pistonCopyParts) return;
    this.sprite.mesh.visible = true;
    this.pistonCopyParts.group.visible = false;
    this.showingCopy = false;
  }

  private _handleManualExtension(deltaMs: number): void {
    if (
      this.state !== "extending" ||
      !this.showingCopy ||
      !this.pistonCopyParts
    )
      return;

    const { currentLength, maxShaftLength } = this.pistonCopyParts;

    const deltaLength = (this.extensionSpeed * deltaMs) / 1000;
    const newLength = currentLength + deltaLength;
    this._setManualShaftLength(newLength);

    if (currentLength === maxShaftLength)
      this.events.emit(PistonEvents.ExtensionCompleted);
  }

  private _handleManualRetraction(deltaMs: number): void {
    if (
      this.state !== "retracting" ||
      !this.showingCopy ||
      !this.pistonCopyParts
    )
      return;

    const { currentLength } = this.pistonCopyParts;

    const deltaLength = (this.retractionSpeed * deltaMs) / 1000;
    const newLength = currentLength - deltaLength;
    this._setManualShaftLength(newLength);

    if (currentLength === this.epsilon)
      this.events.emit(PistonEvents.RetractionCompleted);
  }

  private _setManualShaftLength(length: number): void {
    if (!this.pistonCopyParts) return;
    if (length <= 0) length = this.epsilon;
    if (length > this.pistonCopyParts.maxShaftLength)
      length = this.pistonCopyParts.maxShaftLength;

    this.pistonCopyParts.shaftGroup.scale.y = length;
    this.pistonCopyParts.headGroup.scale.y = 1 / length;

    this.pistonCopyParts.currentLength = length;

    this.pistonCopyParts.shaftTexture.repeat.y =
      length / this.pistonCopyParts.shaftTexture.height;
  }

  private _obtainSpriteVariant(variant: PistonVariant): PistonSprite {
    switch (variant) {
      case "thin": {
        const sprite = getResource<ProtoSpriteSheetThree>(
          Piston,
          "pistonThinSheet"
        ).getSprite<ThinPistonLayer, ThinPistonAnimation>();

        Object.assign(sprite, { variant: "thin" } as const);
        return sprite as ThinSprite;
      }
      case "wide": {
        const sprite = getResource<ProtoSpriteSheetThree>(
          Piston,
          "pistonWideSheet"
        ).getSprite<WidePistonLayer, WidePistonAnimation>();

        Object.assign(sprite, { variant: "wide" } as const);
        return sprite as WideSprite;
      }
      case "spike": {
        const sprite = getResource<ProtoSpriteSheetThree>(
          Piston,
          "pistonSpikeSheet"
        ).getSprite<SpikePistonLayer, SpikePistonAnimation>();

        Object.assign(sprite, { variant: "spike" } as const);
        return sprite as SpikeSprite;
      }
    }
  }

  private _constructPistonCopy(): void {
    const pistonGroup = new Group();
    const shaftGroup = new Group();
    const headGroup = new Group();

    // copy body
    const bodySprite = this.sprite.clone();
    isolateLayer(bodySprite, "body");

    // copy shaft
    let shaftTexture = Piston.shaftTextureCache
      .get(this.sprite.variant)
      ?.clone();
    if (!shaftTexture) {
      this.sprite.gotoAnimation("impacting");
      const impactingFrame = this.sprite.getFrame();
      this.sprite.gotoFrame(0);
      const texture = extractTextureFromLayer(
        this.sprite,
        "shaft",
        impactingFrame
      );
      if (!texture) return;

      Piston.shaftTextureCache.set(this.sprite.variant, texture);
      shaftTexture = texture;
    }

    shaftTexture.minFilter = NearestFilter;
    shaftTexture.magFilter = NearestFilter;
    shaftTexture.wrapT = RepeatWrapping;

    const shaftMaterial = new MeshBasicMaterial({
      map: shaftTexture,
      transparent: true
    });

    const INITIAL_SHAFT_HEIGHT = 1;
    const shaftWidth = shaftTexture.width;
    const shaftGeometry = new PlaneGeometry(shaftWidth, INITIAL_SHAFT_HEIGHT);

    const shaftMesh = new Mesh(shaftGeometry, shaftMaterial);

    // copy head
    const headSprite = this.sprite.clone();
    isolateLayer(headSprite, "head");

    // copy spikes
    let spikeSprite: SpikeSprite | undefined = undefined;
    if (this.sprite.variant === "spike") {
      spikeSprite = this.sprite.clone() as SpikeSprite;
      isolateLayer(spikeSprite, "spikes");
    }

    // anchor shaft
    shaftGeometry.translate(0, INITIAL_SHAFT_HEIGHT / 2, 0);

    // anchor head
    const headBox = headSprite.getLayerBounds("head");
    headSprite.mesh.geometry.translate(0, -headBox.min.y, 0);

    // anchor spike
    let spikeBox = new Box2();
    if (spikeSprite) {
      spikeBox = spikeSprite.getLayerBounds("spikes");
      spikeSprite.mesh.geometry.translate(0, -spikeBox.min.y, 0);
      spikeSprite.mesh.position.y = headBox.getSize(new Vector2()).height;
    }

    // anchor shaft group
    const bodyBox = bodySprite.getLayerBounds("body");
    const bodyTopY = bodyBox.max.y;
    shaftGroup.position.y = bodyTopY;

    // anchor head group
    headGroup.position.y = INITIAL_SHAFT_HEIGHT;

    // determine max shaft length
    const headHeight = headBox.getSize(new Vector2()).height;
    const bodyHeight = bodyBox.getSize(new Vector2()).height;
    const spikeHeight = spikeBox.getSize(new Vector2()).height;

    const maxShaftLength =
      kPixelScale * this.size.height - headHeight - bodyHeight - spikeHeight;

    // construct the scenegraph
    pistonGroup.add(bodySprite.mesh);
    pistonGroup.add(shaftGroup);
    shaftGroup.add(shaftMesh);
    shaftGroup.add(headGroup);
    headGroup.add(headSprite.mesh);
    if (spikeSprite) headGroup.add(spikeSprite.mesh);

    this.object3D.add(pistonGroup);

    pistonGroup.visible = false;

    this.pistonCopyParts = {
      bodySprite,
      shaftTexture,
      shaftMesh,
      headSprite,
      spikeSprite,
      group: pistonGroup,
      shaftGroup,
      maxShaftLength,
      headGroup,
      currentLength: this.epsilon
    };

    this._setManualShaftLength(0);
  }

  private _alignWithTiledSelection(): void {
    // NOTE: this should be here so that tiling pistons get aligned corrects during the manual allingment below
    this.object3D.rotation.z = this.angle;

    this.sprite.hideLayers("piston_bounds"); // used to get an accurate bounding box just around the piston  TODO: slices
    const pistonBoundingBox = this.sprite.getLayerBounds("piston_bounds");

    const originalPistonDimensions = new Vector2();
    pistonBoundingBox.getSize(originalPistonDimensions);
    originalPistonDimensions.multiplyScalar(kInvPixelScale);

    const desiredPistonDimensions = new Vector2(
      this.size.width,
      this.size.height
    );
    const pistonScaleFactor = new Vector2();
    pistonScaleFactor
      .copy(desiredPistonDimensions)
      .divide(originalPistonDimensions);

    if (this.hasTilingShaft && pistonScaleFactor.y > 1) {
      // manually align with the bottom of the Tiled rectangular selection since we are not scaling by Y anymore
      const translationDistance =
        (originalPistonDimensions.height * (pistonScaleFactor.y - 1)) / 2;
      this.object3D.translateY(-translationDistance);

      pistonScaleFactor.y = 1;
    }

    // scale the parent object3D such that the piston sprite is packed in the Tiled rectangular section
    this.object3D.scale.set(pistonScaleFactor.x, pistonScaleFactor.y, 1);
    this.object3D.scale.multiplyScalar(kInvPixelScale);
  }

  private _processInitialCalculations(): void {
    // NOTE: calculate size without rotations for accurate values
    this.object3D.rotation.z = 0;
    this._calculateDesiredBoxes();
    this.desiredPistonHeadBox.getSize(this.pistonHeadSize);
    this.desiredPistonSpikeBox.getSize(this.pistonSpikeSize);
    this.object3D.rotation.z = this.angle;

    this._calculateDesiredBoxes();
    this.desiredPistonHeadBox.getCenter(this.currentPistonHeadCoords);

    // calculate the direction of the piston's extension
    // first, convert our angle into a standard trigonometric angle
    let convertedAngle = this.angle * -1; // for clarity
    convertedAngle = this.ANGLE_OFFSET - convertedAngle;

    this.startingDirectionUnitVector.set(1, 0);
    this.startingDirectionUnitVector.rotateAround(
      new Vector2(0, 0),
      convertedAngle
    );
  }
}
