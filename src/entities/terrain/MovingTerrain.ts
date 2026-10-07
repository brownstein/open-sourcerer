import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Object3D, Vector2 } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

import {
  MotionPathFollowingBehavior,
  MotionPathFollowingEvents
} from "../shared/behaviors/MotionPath";
import { TerrainRenderBehavior } from "./BaseTerrain";
import {
  TerrainIntersectionBehavior,
  TerrainIntersectionEvents
} from "./behaviors/TerrainIntersectionBehavior";
import { CommonTerrainAPI } from "./commonTerrainApi";

export type MovingTerrainProps = EntityProps & {
  traversalSpeed?: number;
  traversalDuration?: number;
  snapDistance?: number;
  isLooping?: boolean;
  hasBoomerangMotion?: boolean;
  shouldMoveImmediately?: boolean;
  bindable?: boolean;
};

export class MovingTerrain extends CoreEntity implements CommonTerrainAPI {
  static type = "MovingTerrain";
  public type = "MovingTerrain";
  public _isTerrain = true;
  public object3D = new Object3D();
  public persist = false;

  // This is a hack. FIXME!
  public alignment = EntityAlignment.TemporaryTerrain;

  // This is also a hack.
  public terrain?: TiledLevelAPI.MapTerrain;

  public behaviors = {
    render: new TerrainRenderBehavior(),
    motionPathFollowing: new MotionPathFollowingBehavior().enableSignaling(),
    terrainIntersection: new TerrainIntersectionBehavior(),
    signal: new SignalConnectionBehavior()
  };

  private body?: RigidBody;
  private colliders?: Collider[];

  constructor(props: MovingTerrainProps) {
    super(props);

    this.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.position.copy(this.position);

    // Set up motion path following.
    this.behaviors.motionPathFollowing
      .init(this)
      .enableSignaling()
      .setTraversalSpeed(props.traversalSpeed ?? 2)
      .setTraversalDuration(props.traversalDuration ?? 0)
      .setSnapDistance(props.snapDistance ?? 10)
      .setAutoSnap(false);

    // NOTE: this is used when boomerang motion is false so the sudden jump in
    //        motion path position doesn't cause entities to be flung (due to setNextKinematicTranslation)
    let shouldTeleportNextTranslation = false;
    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PathEndpointReached,
      () => {
        if (props.isLooping === false) {
          this.behaviors.motionPathFollowing.disable();
          return;
        }

        if (props.hasBoomerangMotion === false) {
          this.behaviors.motionPathFollowing.resetPathProgress();
          shouldTeleportNextTranslation = true;
        }
      }
    );

    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PositionUpdate,
      ([posUpdate]) => {
        this.position.x = posUpdate.x;
        this.position.y = posUpdate.y;
        if (!shouldTeleportNextTranslation) {
          this.body?.setNextKinematicTranslation({
            x: posUpdate.x,
            y: posUpdate.y
          });
        } else {
          shouldTeleportNextTranslation = false;
          this.body?.setTranslation(
            {
              x: posUpdate.x,
              y: posUpdate.y
            },
            true
          );
        }
      }
    );

    const shouldMoveImmediately = props.shouldMoveImmediately ?? true;

    // Set up terrain intersection.
    this.behaviors.terrainIntersection.init(this);
    this.behaviors.terrainIntersection.events.on(
      TerrainIntersectionEvents.TerrainIntersected,
      ({ mergedTerrain, body, colliders }) => {
        this.body = body;
        this.colliders = colliders;

        // perform multiple pipelines of TerrainRenderBehavior to create meshes at various depth offsets
        // for the tiles in each unique depth level
        const decalTilesByDepth = new Map<number, TiledLevelAPI.MapTile[]>();
        mergedTerrain.decalTiles.forEach((decalTile) => {
          const decalTilesAtDepth = decalTilesByDepth.get(decalTile.depth);
          if (!decalTilesAtDepth) {
            decalTilesByDepth.set(decalTile.depth, [decalTile]);
            return;
          }

          decalTilesAtDepth.push(decalTile);
        });

        // now perform renders of every distinct layer/depth of tiles
        this.behaviors.render.init(this);

        for (const [depth, decalTiles] of decalTilesByDepth) {
          const depthOffset = depth - this.position.z;
          this.behaviors.render
            .setTiles(decalTiles)
            .buildTileMeshes(depthOffset)
            .apply();
        }

        this.level?.registerEntityPhysicsHooks({
          entityId: this.id,
          rigidBodyHandle: this.body.handle,
          colliderHandles: this.colliders.map((collider) => collider.handle)
        });

        this.behaviors.motionPathFollowing.snapOntoNearestPathProvider();

        if (shouldMoveImmediately) {
          // disable it at first so start can run
          this.behaviors.motionPathFollowing.disable();

          this.start();
        } else this.stop();
      }
    );

    this.behaviors.signal.init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) this.start();
        else this.stop();
      }
    );
  }

  step(ms: number) {
    super.step(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }

  getRigidBody() {
    return this.body;
  }

  getVertVectors(): Vector2[] {
    return this.terrain?.polygon ?? [];
  }

  disable() {
    this.object3D.visible = false;
    this.body?.setEnabled(false);
  }

  async start(startTimeMs?: number): Promise<void> {
    if (this.behaviors.motionPathFollowing.enabled) return;

    this.behaviors.motionPathFollowing.disable();

    await this.shake(startTimeMs);

    this.behaviors.motionPathFollowing.enable();

    return;
  }

  async stop(stopTimeMs?: number): Promise<void> {
    if (!this.behaviors.motionPathFollowing.enabled) return;

    this.behaviors.motionPathFollowing.disable();
    await this.shake(stopTimeMs);

    return;
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) level.world.removeRigidBody(this.body);
    this.body = undefined;
    this.colliders = undefined;
  }

  get canBindToVariable(): boolean {
    return !!this.initialProps.bindable;
  }
}
