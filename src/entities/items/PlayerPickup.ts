import { Box3, Object3D, Vector2, Vector3 } from "three";

import { EntityProps } from "src/api/entity";
import { ItemDefinition, ItemRenderInstance } from "src/api/item";
import { OverlayPosition } from "src/api/overlay";
import {
  ItemGoingPlaces,
  ItemJuiceOverlayProps,
  ItemPickupJuice
} from "src/components/ui/overlays/overlays/ItemPickupJuice";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector3To2 } from "src/engine/util/vecTypes";
import { allItemDefinitionsByType } from "src/items/allItems";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

export type PlayerPickupProps = EntityProps & {
  itemType?: string;
  itemScale?: number;
  toHotbar?: boolean;
};

// Item pickup sprite provided by chests, NPCs.
export class PlayerPickup extends CoreEntity {
  static type = "PlayerPickup";
  public type = "PlayerPickup";
  public object3D = new Object3D();
  private itemDef: ItemDefinition;
  private renderInstance?: ItemRenderInstance;
  private toHotbar?: boolean;
  constructor(props: PlayerPickupProps) {
    super(props);
    const { itemType, itemScale, toHotbar } = props;
    if (!itemType) throw new Error("A valid itemType is required.");
    this.itemDef = allItemDefinitionsByType[itemType];
    if (!this.itemDef) throw new Error("A valid itemType is required.");
    this.renderInstance = this.itemDef.getRenderInstance({
      type: itemType
    });
    if (typeof itemScale === "number")
      this.object3D.scale.multiplyScalar(itemScale);
    this.object3D.add(this.renderInstance.object3D);
    this.object3D.position.copy(this.position);
    const size3 = new Vector3();
    const box3 = new Box3();
    box3.expandByObject(this.object3D);
    box3.getSize(size3);
    this.size = {
      width: size3.x,
      height: size3.y
    };
    this.toHotbar = toHotbar;
  }
  destroy(): void {
    this.renderInstance?.dispose?.();
    this.renderInstance = undefined;
  }
  pickup(onDone?: () => void) {
    const { level, toHotbar, itemDef } = this;
    if (!level) return;

    // If it's not going to the hotbar, skip the pickup juice.
    if (!toHotbar) {
      level.removeEntity(this.id);
      // Consumables auto-occupied a hotkey slot under the legacy addConsumable
      // path; quest items did not. Preserve that by only hotkeying non-quest items.
      store.dispatch(
        addItems({
          item: { type: itemDef.type },
          hotkey: !itemDef.isQuestItem
        })
      );
      onDone?.();
      return;
    }

    // TODO: make this juicy pickup stuff a standard behavior.
    const { center, size } = level.cameraDirector.getCurrentProperties();
    const cameraSize = size;
    const cameraCenter = center;
    if (!cameraSize || !cameraCenter) return;

    const viewportPosRelative = vector3To2(this.position);
    viewportPosRelative.sub(cameraCenter);
    viewportPosRelative.divide(cameraSize);
    viewportPosRelative.x += 0.5;
    viewportPosRelative.y *= -1;
    viewportPosRelative.y += 0.5;

    const viewportSizeRelative = new Vector2(this.size.width, this.size.height);
    viewportSizeRelative.divide(cameraSize);

    level.ctx?.overlayProvider?.addOverlay<ItemJuiceOverlayProps>({
      component: ItemPickupJuice,
      position: OverlayPosition.Screen,
      overlayProps: {
        viewportPosRelative,
        viewportSizeRelative,
        item: {
          type: itemDef.type
        },
        wheresItGoing: ItemGoingPlaces.HotBar,
        andWhenItGetsThere: () => {
          store.dispatch(
            addItems({
              item: { type: itemDef.type },
              hotkey: true
            })
          );
          onDone?.();
        }
      }
    });

    level.removeEntity(this.id);
  }
}
