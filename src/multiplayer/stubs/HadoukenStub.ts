import { ElementalType } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import {
  getAsset,
  setAssetDependencies
} from "src/engine/entity/decorators";
import * as wtsTypes from "src/entities/enemies/sprites/walker-that-shoot/walker-that-shoot-types";

import { EntityNetSummary } from "../api";
import { ProjectileStub } from "./ProjectileStub";
import { StubEntityProps } from "./StubEntity";

/** Stub for a remote Hadouken: the walker bullet sprite in its loop, with
 *  the bulletcrash animation on impact. */
@setAssetDependencies(() => ["walkerThatShootSprite"])
export class HadoukenStub extends ProjectileStub {
  static type = "HadoukenStub";
  public type = HadoukenStub.type;

  private sprite = getAsset("walkerThatShootSprite").getSprite<
    wtsTypes.sprite_layers,
    wtsTypes.sprite_animations
  >();
  private crashing = false;

  constructor(props: StubEntityProps) {
    super(props);
    this.element = this.element ?? ElementalType.Wind;

    this.sprite.hideLayers("reference");
    this.sprite.gotoAnimation("loop");
    this.sprite.setAnimationLooping(true);
    this.sprite.setAnimationSpeed(1);
    this.sprite.center();
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);
    this.faceVelocity(this.lastSummary);
  }

  protected onSummary(summary: EntityNetSummary): void {
    super.onSummary(summary);
    this.faceVelocity(summary);
  }

  private faceVelocity(summary: EntityNetSummary): void {
    const vel = summary.vel;
    if (!vel) return;
    // Sprite faces left by default; negate scale.x for rightward flight.
    const absScaleX = Math.abs(this.sprite.mesh.scale.x);
    this.sprite.mesh.scale.x = vel.x >= 0 ? -absScaleX : absScaleX;
  }

  protected playImpact(): void {
    if (this.crashing) return;
    this.crashing = true;
    this.sprite.gotoAnimation("bulletcrash");
    this.sprite.setAnimationLooping(false);
    this.sprite.setAnimationSpeed(1);
    const onCrashComplete = () => {
      this.sprite.events.off("animationLooped", onCrashComplete);
      this.removeSelf();
    };
    this.sprite.events.on("animationLooped", onCrashComplete);
  }

  protected advanceVisual(deltaMs: number): void {
    this.sprite.advance(deltaMs);
  }

  destroy(): void {
    this.sprite.dispose();
    super.destroy();
  }
}
