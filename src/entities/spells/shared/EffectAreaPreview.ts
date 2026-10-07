import { Color, Object3D, Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { LineRenderingBehavior } from "src/entities/ui/vfx/LineRenderingBehavior";

export type EffectAreaPreviewProps = EntityProps & {
  vertices?: Vector2[];
  closed?: boolean;
  color?: Color;
  lifetimeMs?: number;
};

export class EffectAreaPreview extends CoreEntity {
  static type = "EffectAreaPreview";
  public type = EffectAreaPreview.type;

  public object3D = new Object3D();
  public behaviors: {
    lineRendering: LineRenderingBehavior;
  };
  public color: Color;
  public vertices: Vector2[];

  constructor(props: EffectAreaPreviewProps) {
    super(props);
    const {
      vertices: verticesIn = [],
      color = new Color(0xffffff),
      closed,
      lifetimeMs
    } = props;
    const vertices = [...verticesIn];
    if (closed) {
      const firstVert = vertices.at(0);
      const lastVert = vertices.at(-1);
      if (firstVert && lastVert && firstVert.distanceTo(lastVert) > 0) {
        vertices.push(firstVert);
      }
    }
    this.vertices = vertices;
    this.color = color;
    this.behaviors = {
      lineRendering: new LineRenderingBehavior({ vertices }).setOpacity(0)
    };
    this.behaviors.lineRendering.setColor(color);
    this.object3D.add(this.behaviors.lineRendering.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.scheduler.add({
      id: "fadeIn",
      duration: 250,
      invokeFunction: (t) => {
        this.behaviors.lineRendering.setOpacity(t);
      }
    });
    if (lifetimeMs !== undefined) {
      this.scheduler.add({
        id: "goAway",
        startIn: lifetimeMs,
        duration: 250,
        invokeFunctionAtStart: () => {
          this.scheduler.cancel("fadeIn");
        },
        invokeFunction: (t) => {
          this.behaviors.lineRendering.setOpacity(
            Math.min(this.behaviors.lineRendering.getOpacity(), 1 - t)
          );
        },
        invokeFunctionAtComplete: () => {
          this.level?.removeEntity(this.id);
        }
      });
    }
  }
}
