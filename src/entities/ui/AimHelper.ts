import { Color, Object3D, Vector2 } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps
} from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import {
  calculateProjectileAngleToInterncept,
  calculateProjectilePositionAtTime
} from "src/util/projectileMath";

import crosshairJson from "./sprites/crosshair.json";
import crosshairPng from "./sprites/crosshair.png";
import { LineRenderingBehavior } from "./vfx/LineRenderingBehavior";

export type ProjectileGuideConfig = {
  getOrigin: () => Vector2;
  speed: number;
  gravity: number;

  directPath?: boolean; //The trajectory is direct and does not

  // how many seconds of flight the guide should simulate
  maxSimTime?: number;

  numPoints?: number;

  color?: number | string | Color;
};

export type AimHelperProps = EntityProps & {
  color?: number | string | Color;
  projectileGuide?: ProjectileGuideConfig;
};

@addResourceLoader(new TextureResourceLoader("crosshairTexture", crosshairPng))
export class AimHelper extends CoreEntity implements BaseEntityType {
  static type = "AimHelper";
  public type = "AimHelper";
  public persist = false;
  public object3D = new Object3D();
  private sprite: ThreeAseprite;
  private visible: boolean = true;
  private guideConfig?: ProjectileGuideConfig;
  private guideLine?: LineRenderingBehavior;
  private guideNumPoints: number;
  private msTotal = 0;
  constructor(props: AimHelperProps) {
    super(props);
    this.sprite = new ThreeAseprite({
      texture: getResource(AimHelper, "crosshairTexture"),
      sourceJSON: crosshairJson
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.x = 0;
    this.sprite.mesh.scale.y = 0;
    const color = props.color ?? 0x44aaff;
    this.sprite.setColor(color);
    this.sprite.setOpacity(0);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.guideConfig = props.projectileGuide;
    this.guideNumPoints = this.guideConfig?.numPoints ?? 40;
    if (this.guideConfig) {
      this._initGuide(color);
    }
  }

  private _initGuide(color: number | string | Color) {
    this.guideLine = new LineRenderingBehavior();
    this.guideLine.setColor(new Color(color));
    this.guideLine.setOpacity(0);
    this.guideLine.mesh.position.z = -1;
    this.object3D.add(this.guideLine.mesh);
  }

  private _updateGuide(cursorX: number, cursorY: number) {
    const config = this.guideConfig;
    if (!config || !this.guideLine) return;

    const origin = config.getOrigin();
    const { speed, gravity } = config;
    const maxSimTime = config.maxSimTime ?? 3;
    const directPath = config.directPath ?? true;

    const relX = cursorX - origin.x;
    const relY = cursorY - origin.y;
    const relPos = new Vector2(relX, relY);

    // Calculate launch velocity — same logic as Fireball.
    let vx: number;
    let vy: number;
    const angle = calculateProjectileAngleToInterncept(
      relPos,
      speed,
      true,
      directPath,
      gravity
    );

    // Positions are relative to object3D (the cursor), so offset by (origin - cursor).
    const offset = new Vector2(origin.x - cursorX, origin.y - cursorY);

    const numPoints = this.guideNumPoints;
    const dt = maxSimTime / (numPoints - 1);
    const vertices: Vector2[] = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i * dt;
      const p = calculateProjectilePositionAtTime(
        offset,
        speed,
        angle,
        t,
        gravity
      );
      vertices.push(p);

      // Stop if the projectile has fallen well below the origin.
      if (p.y < offset.y - 15) break;
    }

    this.guideLine.update(vertices);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.level = level;
    this.level.emit(EntityLevelEvents.UpdateCursorOverrides);
    this.scheduler.add({
      duration: 200,
      invokeFunction: (t) => {
        this.sprite.mesh.scale.x = 0.5 * kInvPixelScale * t;
        this.sprite.mesh.scale.y = 0.5 * kInvPixelScale * t;
        this.sprite.setOpacity(t);
        this._setGuideOpacity(t * 0.85);
      },
      invokeFunctionAtComplete: () => {
        this.sprite.mesh.scale.x = 0.5 * kInvPixelScale;
        this.sprite.mesh.scale.y = 0.5 * kInvPixelScale;
        this.sprite.setOpacity(1);
        this._setGuideOpacity(0.85);
      }
    });
  }
  detachFromLevel(level: EntityLevelAPI): void {
    this.level?.emit(EntityLevelEvents.UpdateCursorOverrides);
    super.detachFromLevel(level);
    this.level = undefined;
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.mesh.rotation.z += ms * 0.002;
    const cursorPosition = this.level?.controls?.cursorScenePosition;
    const cursorActive = this.level?.controls?.cursorActive ?? true;
    if (cursorPosition) {
      this.position.x = cursorPosition.x;
      this.position.y = cursorPosition.y;
      if (this.guideConfig) {
        this._updateGuide(cursorPosition.x, cursorPosition.y);
      }
    }
    this.object3D.position.copy(this.position);
    this.object3D.position.z = 20;
    this.setVisible(cursorActive);
    this.msTotal += ms;
    this.guideLine?.setOffset(this.msTotal * 0.001);
  }
  goAway(success?: boolean) {
    this.scheduler.add({
      duration: 200,
      invokeFunction: (t) => {
        const newScale = success
          ? kInvPixelScale * 0.5 * (1 + t * 2 - t * t * 3)
          : kInvPixelScale * 0.5 * (1 - t);
        this.sprite.mesh.scale.x = newScale;
        this.sprite.mesh.scale.y = newScale;
        this.sprite.setOpacity(1 - t);
        this._setGuideOpacity(0.85 * (1 - t));
      },
      invokeFunctionAtComplete: () => {
        this._disposeGuide();
        this.level?.removeEntity(this.id);
      }
    });
  }
  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    this.scheduler.add({
      duration: 200,
      invokeFunction: (t) => {
        this.sprite.setOpacity(visible ? t : 1 - t);
        this._setGuideOpacity((visible ? t : 1 - t) * 0.85);
      },
      invokeFunctionAtComplete: () => {
        this.sprite.setOpacity(visible ? 1 : 0);
        this._setGuideOpacity(visible ? 0.85 : 0);
      }
    });
  }

  private _setGuideOpacity(opacity: number) {
    this.guideLine?.setOpacity(opacity);
  }

  private _disposeGuide() {
    if (this.guideLine) {
      this.object3D.remove(this.guideLine.mesh);
      this.guideLine.destroy();
      this.guideLine = undefined;
    }
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
    this._disposeGuide();
  }

  cursorOverrides() {
    return new Set(["no-cursor"]);
  }
}
