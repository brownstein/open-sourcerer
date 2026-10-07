import { Object3D, Texture } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { EntityProps, EntitySnapshot } from "src/api/entity";
import { TypedEventEmitter } from "src/api/util";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import {
  RuneValueEventTypes,
  runeConnectionFlag
} from "../runes/behaviors/RuneBehaviorsShared";
import { RuneConnectivityBehavior } from "../runes/behaviors/RuneConnectivity";
import { hasValueBehavior } from "../runes/behaviors/RuneValue";
import { ShrineDoorPhysicsBehavior } from "./behaviors/ShrineDoorPhysicsBehavior";
import doorJson from "./sprites/shrine-door/shrine-door.json";
import doorPng from "./sprites/shrine-door/shrine-door.png";

export type ShrineDoorProps = EntityProps & {};

@addResourceLoader(new TextureResourceLoader("doorTexture", doorPng))
export class ShrineDoor extends CoreEntity {
  static type = "ShrineDoor";
  public type = "ShrineDoor";
  public [runeConnectionFlag] = true as const;
  public object3D = new Object3D();

  public behaviors = {
    connectivity: new RuneConnectivityBehavior(),
    physics: new ShrineDoorPhysicsBehavior()
  };

  private sprite = new ThreeAseprite({
    texture: getResource<Texture>(ShrineDoor, "doorTexture"),
    sourceJSON: doorJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  private foregroundSprite = new ThreeAseprite({
    texture: getResource<Texture>(ShrineDoor, "doorTexture"),
    sourceJSON: doorJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  private isOpen = false;
  private connectedValueEmitters = new Set<
    TypedEventEmitter<RuneValueEventTypes>
  >();

  constructor(props: ShrineDoorProps) {
    super(props);

    this.behaviors.connectivity.init(this);
    this.behaviors.physics.init(this);

    this.sprite.playingAnimation = false;
    this.sprite.gotoTag("overgrown");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);

    this.foregroundSprite.playingAnimation = false;
    this.foregroundSprite.gotoTag("overgrown");
    this.foregroundSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.foregroundSprite.mesh.position.z = 32;
    this.foregroundSprite.setLayerOpacities(
      {
        "Right door": 1
      },
      0
    );
    this.object3D.add(this.foregroundSprite.mesh);

    this.object3D.position.copy(this.position);

    this.behaviors.connectivity.events.on("connectedBy", (connectedBy) => {
      if (hasValueBehavior(connectedBy)) {
        if (connectedBy.behaviors.value.getRawValue()) this.open();
        const valueEmitter = connectedBy.behaviors.value.events;
        valueEmitter.on("valueChanged", this.onConnectedValueChanged);
        this.connectedValueEmitters.add(valueEmitter);
      }
    });

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.isOpen) {
        this.sprite.gotoTagFrame(3);
        this.sprite.playingAnimation = false;
      } else {
        this.sprite.gotoTagFrame(0);
        this.sprite.playingAnimation = false;
      }
    });
  }
  private readonly onConnectedValueChanged = ([success, value]: [
    boolean,
    unknown
  ]): void => {
    if (!success || !value) {
      this.close();
      return;
    }
    this.open();
  };
  step(ms: number) {
    this.sprite.animate(ms);
    this.foregroundSprite.gotoTag(this.sprite.getCurrentTag());
    this.foregroundSprite.gotoFrame(this.sprite.getCurrentFrame());
  }
  open() {
    this.isOpen = true;
    this.sprite.playingAnimation = true;
    this.sprite.playingAnimationBackwards = false;
    this.behaviors.physics.disable();
  }
  close() {
    this.isOpen = false;
    this.sprite.playingAnimation = true;
    this.sprite.playingAnimationBackwards = true;
    this.behaviors.physics.enable();
  }
  getSnapshot(): EntitySnapshot {
    return {
      ...super.getSnapshot(),
      isOpen: this.isOpen
    };
  }
  applySnapshot(snapshot: EntitySnapshot): void {
    super.applySnapshot(snapshot);
    if (snapshot.isOpen) {
      this.isOpen = true;
      this.behaviors.physics.disable();
      this.sprite.gotoTagFrame(3);
      this.foregroundSprite.gotoTagFrame(3);
      this.sprite.playingAnimation = false;
    }
  }
  destroy(): void {
    super.destroy();
    for (const valueEmitter of this.connectedValueEmitters) {
      valueEmitter.off("valueChanged", this.onConnectedValueChanged);
    }
    this.connectedValueEmitters.clear();
    this.sprite.dispose();
    this.foregroundSprite.dispose();
  }
}
