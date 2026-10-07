// NOTE: helper classes for backgrounds comprised of multiple parallax images
import { clamp } from "three/src/math/MathUtils.js";

import { Scheduler } from "src/engine/scheduling/Scheduler";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { ParallaxImage } from "src/entities/environment/ParallaxImage";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";

export class Background {
  private images: ParallaxImage[];
  private _opacity = 1;
  private scheduler: Scheduler = new Scheduler();

  constructor(images: ParallaxImage[], startingOpacity?: number) {
    this.images = images;
    this.opacity = startingOpacity ?? this.opacity;
  }

  step(deltaMs: number): void {
    this.scheduler.step(deltaMs);
  }

  get opacity(): number {
    return this._opacity;
  }
  set opacity(opacity: number) {
    this._opacity = clamp(opacity, 0, 1);
    this.images.forEach((image) =>
      image.behaviors.render.setOpacity(this.opacity)
    );
  }

  makeVisible(): void {
    this.opacity = 1;
  }
  makeInvisible(): void {
    this.opacity = 0;
  }

  fadeIn(duration: number): void {
    this.scheduler.cancelAll();

    const startingOpacity = this.opacity;
    this.scheduler.add({
      duration: duration,
      invokeFunction: (relativeTime) => {
        const newOpacity = startingOpacity + relativeTime;
        this.opacity = newOpacity;
      }
    });
  }

  fadeOut(duration: number): void {
    this.scheduler.cancelAll();

    const startingOpacity = this.opacity;
    this.scheduler.add({
      duration: duration,
      invokeFunction: (relativeTime) => {
        const newOpacity = startingOpacity - relativeTime;
        this.opacity = newOpacity;
      }
    });
  }
}

export class TransitionalBackground {
  private readonly background: Background;
  public transitionDuration: number = 1500;

  constructor(
    background: Background,
    fadeInTriggers: AreaTrigger[],
    fadeOutTriggers: AreaTrigger[],
    transitionDuration?: number
  ) {
    this.background = background;
    this.transitionDuration = transitionDuration ?? this.transitionDuration;

    fadeInTriggers.forEach((trigger) =>
      trigger.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contactedEntity) => {
          if (!isPlayerAPI(contactedEntity)) return;

          this.background.fadeIn(this.transitionDuration);
        }
      )
    );

    fadeOutTriggers.forEach((trigger) =>
      trigger.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contactedEntity) => {
          if (!isPlayerAPI(contactedEntity)) return;

          this.background.fadeOut(this.transitionDuration);
        }
      )
    );
  }

  step(deltaMs: number): void {
    this.background.step(deltaMs);
  }
}
