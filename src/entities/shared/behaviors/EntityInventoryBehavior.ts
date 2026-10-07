import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { ItemData } from "src/api/item";
import { OverlayAPI, OverlayPosition } from "src/api/overlay";
import { isSpellItemData } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import {
  EntityInventory,
  EntityInventoryOverlayProps
} from "src/components/ui/overlays/overlays/EntityInventory";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { getItemDefinitionByType } from "src/items/allItems";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

type EntityInventoryBehaviorEvents = {
  takeAll: void;
};

export class EntityInventoryBehavior implements EntityBehavior {
  public type = "EntityInventory";
  public items: ItemData[] = [];
  public events = createTypedEventEmitter<EntityInventoryBehaviorEvents>();

  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private overlay?: OverlayAPI<EntityInventoryOverlayProps>;
  private pickupEmitter = new DeferredEmitter();
  private scheduler = new Scheduler();

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(
      EntityLifecycleEvents.Step,
      this.scheduler.step.bind(this.scheduler)
    );
  }
  open() {
    if (!this.entity) return;
    if (this.overlay) return;
    this.overlay = this.level?.ctx?.overlayProvider?.addOverlay({
      component: EntityInventory,
      position: OverlayPosition.Viewport,
      overlayProps: {
        entity: this.entity,
        items: this.items,
        deferredPickupEmitter: this.pickupEmitter
      }
    });
    this.pickupEmitter.once("done", () => {
      store.dispatch(
        addItems(
          ...this.items.map((item) => ({
            item,
            hotkey: true
          }))
        )
      );
      this.items = [];
      this.scheduler.add({
        startIn: 500,
        invokeFunctionAtComplete: () => {
          this.close();
        }
      });
      this.events.emit("takeAll");
    });
  }
  close() {
    this.overlay?.remove();
    this.overlay = undefined;
  }
  destroy() {
    this.overlay?.remove();
    this.overlay = undefined;
  }
  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
  }
  detachFromLevel(level: EntityLevelAPI) {
    this.overlay?.remove();
    this.overlay = undefined;
    this.level = undefined;
  }
}
