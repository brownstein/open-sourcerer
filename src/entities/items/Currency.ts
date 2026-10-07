import { Object3D, Vector2, Vector3 } from "three";

import { EntityProps, LevelAPI } from "src/api/entity";
import { OverlayPosition } from "src/api/overlay";
import {
  ItemGoingPlaces,
  ItemJuiceOverlayProps,
  ItemPickupJuice
} from "src/components/ui/overlays/overlays/ItemPickupJuice";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import {
  CurrencyDefinition,
  CurrencyType,
  CurrencyValues
} from "src/items/currencies/Currency";
import * as gemsTypes from "src/items/currencies/gems";
import { breakDownCurrencyIntoDenominations } from "src/items/currencies/util";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { Player } from "../player/Player";
import { GlowParticlesBehavior } from "../shared/behaviors/GlowParticles";
import {
  ItemPhysicsBehavior,
  ItemPhysicsEvents
} from "../shared/behaviors/ItemPhysics";

export type CurrencyProps = EntityProps & {
  currencyType?: CurrencyType;
  value?: number;
  isStatic?: boolean;
};

@setAssetDependencies(() => ["gemsSprite"])
export class Currency extends CoreEntity {
  static type = "Currency";
  public type = "Currency";
  override get canBindToVariable() {
    return true;
  }
  public object3D = new Object3D();
  public behaviors = {
    physics: new ItemPhysicsBehavior(),
    particles: new GlowParticlesBehavior()
  };
  public currencyType: CurrencyType;
  private sprite = getAsset("gemsSprite").getSprite<
    gemsTypes.sprite_layers,
    gemsTypes.sprite_animations
  >();
  constructor(props: CurrencyProps) {
    super(props);
    this.size = {
      width: 0.25,
      height: 0.35
    };
    this.currencyType =
      props.currencyType && props.currencyType in CurrencyType
        ? props.currencyType
        : CurrencyType.Green;

    this.sprite.center();
    this.sprite.hideLayers("blue", "green", "red");
    switch (this.currencyType) {
      case CurrencyType.Blue:
        this.sprite.showLayers("blue");
        break;
      case CurrencyType.Green:
        this.sprite.showLayers("green");
        break;
      case CurrencyType.Red:
        this.sprite.showLayers("red");
        break;
    }

    this.sprite.gotoAnimation("idle");
    this.sprite.center();
    this.sprite.mesh.scale.y = -1;
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.physics.init(this);
    this.behaviors.particles.init(this);
    this.behaviors.particles.object3D.position.z = -1;

    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      if (ms === 0 && Math.floor(Math.random() * 2) === 0) {
        p.position.x = (Math.random() - 0.5) * this.size.width * 1.5;
        p.position.y = (Math.random() - 0.5) * this.size.height * 1.5;
        p.velocity.multiplyScalar(2);
        p.velocity.y = Math.abs(p.velocity.y);
        p.velocity.x *= 0.5;
        p.lifetimeMs = 500;
      } else {
        p.size = 0.05 * Math.sin((Math.PI * p.ms) / p.lifetimeMs);
      }
    };

    this.behaviors.physics.events.on(
      ItemPhysicsEvents.CollideWithEntity,
      ([entity]) => {
        if (entity.type === Player.type) {
          this.pickup();
        }
      }
    );

    const isStatic = props.isStatic ?? true;
    if (isStatic) this.behaviors.physics.setGravityScale(0);
  }
  destroy() {
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  pickup() {
    const { level } = this;
    if (!level) return;

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
          type: CurrencyDefinition.type,
          variant: this.currencyType
        },
        wheresItGoing: ItemGoingPlaces.HotBar,
        andWhenItGetsThere: () => {
          store.dispatch(
            addItems({
              item: {
                type: CurrencyDefinition.type,
                variant: this.currencyType
              }
            })
          );
        }
      }
    });

    // Detach physics to end collisions.
    this.behaviors.physics.detachFromLevel();

    this.sprite.gotoAnimation("take");
    this.sprite.setAnimationSpeed(1);
    this.sprite.setAnimationLooping(true);

    this.scheduler.add({
      startIn: 200,
      duration: 100,
      invokeFunction: (t) => {
        this.sprite.setOpacity(1 - t);
      },
      invokeFunctionAtComplete: () => {
        level.removeEntity(this.id);
      }
    });
  }

  static dropCoins(amount: number, position: Vector3, level: LevelAPI) {
    const currencyToDrop = breakDownCurrencyIntoDenominations(amount);
    for (const [currencyType, numCurrency] of currencyToDrop) {
      for (let i = 0; i < numCurrency; i++) {
        const gem = new Currency({
          currencyType,
          value: CurrencyValues[currencyType],
          position: position.clone()
        });
        level.addEntity(gem);
      }
    }
  }
}
