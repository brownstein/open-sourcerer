import { Object3D, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  ElementalType,
  EntityAlignment,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector2To3 } from "src/engine/util/vecTypes";
import { HitArea } from "src/entities/shared/HitArea";

import fireBlastJson from "./sprites/fire-blast.json";
import fireBlastPng from "./sprites/fire-blast.png";

export type FireBlastProps = EntityProps & {
  scale?: number;
  power?: number;
  alignment?: EntityAlignment;
  sourceEntity?: BaseEntityType;
};

@addResourceLoader(new TextureResourceLoader("fireBlastTexture", fireBlastPng))
export class FireBlast extends CoreEntity implements BaseEntityType {
  static type = "FireBlast";
  public type = "FireBlast";

  public object3D = new Object3D();
  public scale = 1;
  public power = 10;
  public alignment?: EntityAlignment;
  public sourceEntity?: BaseEntityType;

  public sprite = new ThreeAseprite({
    texture: getResource(FireBlast, "fireBlastTexture"),
    sourceJSON: fireBlastJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
    offset: {
      x: 72,
      y: -32
    }
  });

  constructor(props: FireBlastProps) {
    super(props);

    this.scale = props.scale ?? this.scale;
    this.power = props.power ?? this.power;
    this.alignment = props.alignment;
    this.sourceEntity = props.sourceEntity;

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D?.add(this.sprite.mesh);
    this.object3D.scale.set(this.scale, this.scale, 1);
    this.sprite.addFrameTrigger(1, "expanded");
    this.sprite.addFrameTrigger(2, "expanded");
    this.sprite.addFrameTrigger(4, "expanded");
    this.sprite.addEventListener("expanded", this.onExpansion.bind(this));
    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      this.level?.removeEntity(this.id);
      this.destroy();
    });
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.onExpansion();
  }

  onExpansion() {
    const damageOffset = new Vector2();
    const layerClipping = this.sprite.getLayerBoundingBox("Flame");
    if (!layerClipping) return;
    const r = 0.5 * (layerClipping.yMax - layerClipping.yMin);
    damageOffset.x = layerClipping.xMax - r;
    damageOffset.y = layerClipping.yMax - r;
    damageOffset.multiplyScalar(kInvPixelScale);
    const flipped = Math.cos(this.angle) >= 0;
    if (flipped) damageOffset.x *= -1;
    damageOffset
      .rotateAround(new Vector2(), flipped ? this.angle + Math.PI : this.angle)
      .multiplyScalar(this.scale);
    const damageArea = new HitArea({
      position: this.position.clone().add(vector2To3(damageOffset)),
      sourceEntity: this.sourceEntity ?? this
    })
      .setCircle(r * this.scale * kInvPixelScale)
      .setDamage(this.power, ElementalType.Fire)
      .setTargetAlignment(
        // This is jank.
        // TODO: de-jank.
        this.alignment === EntityAlignment.Player
          ? EntityAlignment.Enemy
          : EntityAlignment.Player
      );
    this.level?.addEntity(damageArea);
  }

  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    if (Math.cos(this.angle) >= 0) {
      this.object3D.scale.x = this.scale;
      this.object3D.rotation.z = this.angle;
    } else {
      this.object3D.scale.x = -this.scale;
      this.object3D.rotation.z = Math.PI + this.angle;
    }
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
