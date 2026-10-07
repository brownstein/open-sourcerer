import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Vector3 } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { ItemRenderInstance } from "src/api/item";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "src/entities/player/PlayerAPI";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { allItemDefinitionsByType } from "src/items/allItems";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { GlowParticlesBehavior } from "../shared/behaviors/GlowParticles";

export enum ItemBookEvents {
  Pickup = "Pickup"
}

export class ItemBook extends CoreEntity implements InteractionProvider {
  static type = "ItemBook";
  public type = "ItemBook";
  public persist = true;

  public object3D = new Object3D();

  public behaviors = {
    particles: new GlowParticlesBehavior()
  };

  public itemBookEvents = createTypedEventEmitter<{
    [ItemBookEvents.Pickup]: void;
  }>();

  private enabled = true;
  private focused = false;
  private sensor?: Collider;
  private nearPlayer?: PlayerAPI;
  private focusPrompt?: KeyboardKeyPrompt;

  private renderInstance: ItemRenderInstance;

  constructor(props: EntityProps) {
    super(props);

    this.setFocused = this.setFocused.bind(this);
    this.onInteract = this.onInteract.bind(this);

    const itemDef = allItemDefinitionsByType["Book"];
    if (!itemDef) throw new Error("Item definition for book not found.");
    this.renderInstance = itemDef.getRenderInstance({
      type: "Book"
    });
    this.object3D.add(this.renderInstance.object3D);
    this.object3D.position.copy(this.position);

    this.behaviors.particles.init(this);
    this.behaviors.particles.object3D.position.z--;
    this.behaviors.particles.particleSettings.lifetimeMs = 800;
    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      p.size *= 0.9;
      p.velocity.clampLength(0.0001, 0.0003);
    };
  }

  destroy(): void {
    super.destroy();
    this.renderInstance.dispose?.();
  }

  attachToLevel(level: EntityLevelAPI) {
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

  detachFromLevel(level: EntityLevelAPI): void {
    if (this.focusPrompt) level?.removeEntity(this.focusPrompt.id);
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    super.detachFromLevel(level);
    this.sensor = undefined;
  }

  step(ms: number) {
    super.step(ms);
    if (!this.sensor) return;
    this.sensor.setTranslation(this.position);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    let nearPlayer: PlayerAPI | undefined;
    if (this.enabled) {
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
        this.nearPlayer.addInteraction(this.id, this);
      } else {
        this.setFocused(false);
        this.nearPlayer?.removeInteraction(this.id);
        this.nearPlayer = undefined;
      }
    }
  }

  setFocused(focused: boolean) {
    if (focused !== this.focused) {
      if (focused) {
        const promptPos = this.position.clone();
        promptPos.y += 1.5;
        const prompt = new KeyboardKeyPrompt({ position: promptPos, key: "e" });
        this.level?.addEntity(prompt);
        this.focusPrompt = prompt;
      } else {
        if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
        this.focusPrompt = undefined;
      }
    }
    this.focused = focused;
  }
  onInteract() {
    if (!this.nearPlayer) return;
    this.nearPlayer.removeInteraction(this.id);
    this.itemBookEvents.emit(ItemBookEvents.Pickup);
    store.dispatch(addItems({ item: { type: "Book" } }));
    this.disable();
    this.level?.removeEntity(this.id);
  }

  isPickedUp() {
    return !this.level;
  }

  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }

  teleport(position: Vector3) {
    this.position.copy(position);
  }
}
