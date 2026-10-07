import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { incrementMana } from "src/redux/status/slice";
import { store } from "src/redux/store";

import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "../player/PlayerAPI";
import manaFountainJson from "./sprites/manalith/manalith-1.json";
import manaFountainPng from "./sprites/manalith/manalith-1.png";

export type ManaFountainProps = EntityProps;
@addResourceLoader(
  new TextureResourceLoader("manaFountainTexture", manaFountainPng)
)
export class ManaFountain extends CoreEntity implements InteractionProvider {
  static type = "ManaFountain";
  public type = "ManaFountain";
  public object3D = new Object3D();
  public alignment = EntityAlignment.Environment;
  override get canBindToVariable() { return true; }
  private sprite: ThreeAseprite;
  private nearPlayer?: PlayerAPI;
  private focused = false;
  private focusPrompt?: KeyboardKeyPrompt;
  private sensor?: Collider;
  constructor(props: ManaFountainProps) {
    super(props);
    this.size = {
      width: 80 * kInvPixelScale,
      height: 80 * kInvPixelScale
    };
    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(ManaFountain, "manaFountainTexture"),
      sourceJSON: manaFountainJson,
      frameName: (f) => `(${f.layerName}) ${f.frame}`
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.position.z--;
    this.object3D.position.copy(this.position);
    this.object3D.add(this.sprite.mesh);
    this.scheduler.add({
      id: "pulseLights",
      duration: 1000,
      recurring: true,
      invokeFunction: (t) => {
        const brightness = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        this.sprite.setLayerFades({
          Glow: [0x88ccff, brightness]
        });
      }
    });
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
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
    super.detachFromLevel(level);
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
    if (!this.sensor) return;
    let nearPlayer: PlayerAPI | undefined;
    this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
      const otherEntityId = this.level?.getEntityIdForCollider(
        collider2.handle
      );
      if (!otherEntityId) return;
      const otherEntity = this.level?.getEntity(otherEntityId);
      if (!otherEntity || !isPlayerAPI(otherEntity)) return;
      nearPlayer = otherEntity;
    });
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
        promptPos.y += 1.75;
        const prompt = new KeyboardKeyPrompt({ position: promptPos, key: "e" });
        this.level?.addEntity(prompt);
        this.focusPrompt = prompt;
      } else {
        if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
        this.focusPrompt = undefined;
      }
    }
    this.focused = focused;
    this.sprite.setOutline(focused ? 1 : 0, 0x22aaff, 1);
  }
  onInteract() {
    store.dispatch(incrementMana(999));
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
