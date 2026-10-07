import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Vector2 } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { ItemDefinition, ItemRenderInstance } from "src/api/item";
import { OverlayPosition } from "src/api/overlay";
import {
  ItemGoingPlaces,
  ItemJuiceOverlayProps,
  ItemPickupJuice
} from "src/components/ui/overlays/overlays/ItemPickupJuice";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { vector3To2 } from "src/engine/util/vecTypes";
import { PlayerAPI, isPlayerAPI } from "src/entities/player/PlayerAPI";
import { CoalesceEffect } from "src/entities/shared/graphics/coalesce/CoaleseEffect";
import { getItemDefinitionByType } from "src/items/allItems";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

export type MakeItemProps = EntityProps & {
  itemType?: string;
  spriteScale?: number;
};

export class MakeItem extends CoreEntity {
  static type = "MakeItem";
  public type = MakeItem.type;

  public object3D = new Object3D();
  public deferredPickupEmitter = new DeferredEmitter();

  private itemType?: string;
  private itemDefinition?: ItemDefinition;
  private itemRenderInstance?: ItemRenderInstance;
  private itemSpriteScale = 0.5;

  private active = false;
  private ready = false;
  private coalesceEffect?: CoalesceEffect;

  private sensor?: Collider;
  private nearPlayer?: PlayerAPI;
  private pickedUp = false;

  constructor(props: MakeItemProps) {
    super(props);

    this.itemType = props.itemType;
    this.itemDefinition = this.itemType
      ? getItemDefinitionByType(this.itemType)
      : undefined;
    this.itemSpriteScale = props.spriteScale ?? this.itemSpriteScale;

    if (this.itemType && this.itemDefinition) {
      this.itemRenderInstance = this.itemDefinition.getRenderInstance({
        type: this.itemType
      });
      this.itemRenderInstance.object3D.scale.multiplyScalar(
        this.itemSpriteScale
      );
      this.coalesceEffect = new CoalesceEffect({
        target: this.itemRenderInstance.object3D,
        rows: 32,
        cols: 32,
        duration: 2000,
        spread: 1,
        particleEffector: (p) => {
          p.startPosition.y += 3;
        }
      });
      this.coalesceEffect.deferredEvents.on("done", () => {
        this.ready = true;
      });
      this.object3D.add(this.coalesceEffect.object3D);
    }

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    // Add sensor to detect player.
    // TODO: standardize this logic in a behavior.
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.size.width * 0.5,
      this.size.height * 0.5
    )
      .setTranslation(this.position.x, this.position.y)
      .setSensor(true);
    this.sensor = level.world.createCollider(colliderDesc);
    level.registerSensor(this.id, this.sensor.handle);
  }
  destroy(): void {
    super.destroy();
    this.itemRenderInstance?.dispose?.();
  }
  step(ms: number) {
    super.step(ms);
    if (this.active) this.coalesceEffect?.step(ms);

    let nearPlayer: PlayerAPI | undefined;
    if (this.active && this.ready && this.sensor) {
      this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
        const otherEntityId = this.level?.getEntityIdForCollider(
          collider2.handle
        );
        if (!otherEntityId) return;
        const otherEntity = this.level?.getEntity(otherEntityId);
        if (!otherEntity || !isPlayerAPI(otherEntity)) return;
        nearPlayer = otherEntity;
      });
    }
    if (nearPlayer !== this.nearPlayer) {
      if (nearPlayer) {
        this.nearPlayer = nearPlayer;
        this.collect();
      } else {
        this.nearPlayer?.removeInteraction(this.id);
        this.nearPlayer = undefined;
      }
    }

    this.object3D.position.copy(this.position);
  }
  fadeIn() {
    if (this.active) return;
    this.active = true;
    this.scheduler.add({
      duration: 3000,
      recurring: true,
      invokeFunction: (t) => {
        this.position.y =
          this.initialProps.position.y + Math.sin(t * Math.PI * 2) * 0.2;
      }
    });
  }
  collect() {
    if (this.pickedUp) return;
    this.pickedUp = true;
    const { nearPlayer, itemRenderInstance, level } = this;
    if (!nearPlayer || !itemRenderInstance || !level) return;
    if (this.sensor) this.level?.world.removeCollider(this.sensor, false);
    this.object3D.visible = false;
    this.level?.removeEntityPhysicsHooks(this.id);

    const doSequence = async () => {
      const deferred = new DeferredEmitter();
      const deferredDone = nearPlayer.pickupItem(
        itemRenderInstance.object3D,
        deferred
      );

      deferredDone.on("heldInTheAir", async () => {
        store.dispatch(enableUIElements([EnableElements.HotBar]));
        this.scheduler.add({
          id: "holdInAir",
          duration: 1000,
          invokeFunctionAtComplete: () => {
            deferred.emit("done");

            // TODO: standardize.
            const cameraProperties =
              level.cameraDirector.getCurrentProperties();
            const cameraSize = cameraProperties.size;
            const cameraCenter = cameraProperties.center;
            const itemType = this.itemType;
            if (!cameraSize || !cameraCenter || !itemType) return;

            const viewportPosRelative = vector3To2(this.position);
            viewportPosRelative.y += 1.3;

            viewportPosRelative.sub(cameraCenter);
            viewportPosRelative.divide(cameraSize);
            viewportPosRelative.x += 0.5;
            viewportPosRelative.y *= -1;
            viewportPosRelative.y += 0.5;

            const viewportSizeRelative = new Vector2(
              this.size.width,
              this.size.height
            );
            viewportSizeRelative.divide(cameraSize);

            level.ctx?.overlayProvider?.addOverlay<ItemJuiceOverlayProps>({
              component: ItemPickupJuice,
              position: OverlayPosition.Screen,
              overlayProps: {
                viewportPosRelative,
                viewportSizeRelative,
                item: {
                  type: itemType
                },
                wheresItGoing: ItemGoingPlaces.HotBar,
                andWhenItGetsThere: () => {
                  store.dispatch(
                    addItems({
                      item: { type: itemType },
                      hotkey: true
                    })
                  );
                  this.deferredPickupEmitter.emit("done");
                }
              }
            });
          }
        });
      });

      await deferredDone.getPromise();
      this.level?.removeEntity(this.id);
      this.destroy();
    };
    doSequence();
  }
}
