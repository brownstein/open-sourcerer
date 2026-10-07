import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Texture, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { CameraRequestPriority } from "src/api/camera";
import { ControlEvents } from "src/api/controls";
import { Conversation } from "src/api/conversation";
import {
  BaseEntityType,
  EntityAlignment,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter, typedEmitterPromise } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { IVector2, vector3To2 } from "src/engine/util/vecTypes";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "src/entities/player/PlayerAPI";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";

import adanaJson from "./sprites/adana_v6.json";
import adanaPng from "./sprites/adana_v6.png";
import adanaBirdJson from "./sprites/adana_v6_bird.json";
import adanaBirdPng from "./sprites/adana_v6_bird.png";

export enum AdanaEvents {
  BirdModeActivated = "BirdModeActivated",
  BirdModeFlying = "BirdModeFlying",
  BirdModeFlightDone = "BirdModeFlightDone",
  HumanoidModeActivated = "HumanoidModeActivated"
}

export type AdanaEventTypes = EntityLifecycleEventTypes & {
  [AdanaEvents.BirdModeActivated]: void;
  [AdanaEvents.BirdModeFlying]: void;
  [AdanaEvents.BirdModeFlightDone]: void;
  [AdanaEvents.HumanoidModeActivated]: void;
};

export type AdanaProps = EntityProps & {
  enableConverse?: boolean;
  isCurrentlyABird?: boolean;
  isCurrentlyFlying?: boolean;
  onRequestConversation?: () => Conversation<string, string> | null;
};

@addResourceLoader(new TextureResourceLoader("AdanaTexture", adanaPng))
@addResourceLoader(new TextureResourceLoader("AdanaBirdTexture", adanaBirdPng))
export class Adana
  extends CoreEntity
  implements BaseEntityType, InteractionProvider
{
  static type = "Adana";
  public type = "Adana";
  public alignment = EntityAlignment.NPC;
  public events = createTypedEventEmitter<AdanaEventTypes>();
  public persist = false;
  public object3D = new Object3D();
  public nearPlayer?: PlayerAPI;
  public mainSprite = new ThreeAseprite({
    sourceJSON: adanaJson,
    texture: getResource<Texture>(Adana, "AdanaTexture"),
    frameName: ({ frame, layerName }) => `(${layerName}) ${frame}`
  });
  public behaviors = {
    outOfBounds: new OutOfBoundsBehaviour()
  };
  public birdSprite = new ThreeAseprite({
    sourceJSON: adanaBirdJson,
    texture: getResource<Texture>(Adana, "AdanaBirdTexture"),
    frameName: ({ frame, layerName }) => `(${layerName}) ${frame}`
  });
  private spriteEvents = createTypedEventEmitter<{
    mainAnimationDone: void;
    birdAnimationDone: void;
  }>();
  private opacity = 0;
  private isCurrentlyABird = false;
  private isCurrentlyFlying = false;
  private enabled = true;
  private focused = false;
  private sensor?: Collider;
  private focusPrompt?: KeyboardKeyPrompt;
  private conversation?: OverlayConversation;
  private requestConversation?: () => Conversation<string, string> | null;
  private flight?: {
    from: Vector2;
    to: Vector2;
    duration: number;
    progress: number;
  };
  constructor(props: AdanaProps) {
    super(props);

    this.enabled = props.enableConverse !== false;
    this.opacity = props.opacity ?? this.opacity;
    this.requestConversation = props.onRequestConversation;

    if (typeof props.isCurrentlyABird === "boolean")
      this.isCurrentlyABird = props.isCurrentlyABird;
    if (typeof props.isCurrentlyFlying === "boolean")
      this.isCurrentlyFlying = props.isCurrentlyFlying;

    this.mainSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.birdSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.mainSprite.gotoTag("Idle");
    this.birdSprite.gotoTag(this.isCurrentlyFlying ? "Fly" : "Idle");
    this.mainSprite.setOpacity(this.opacity);
    this.birdSprite.setOpacity(this.opacity);
    this.mainSprite.addEventListener(StandardEvents.animationComplete, () => {
      this.spriteEvents.emit("mainAnimationDone");
    });
    this.birdSprite.addEventListener(StandardEvents.animationComplete, () => {
      this.spriteEvents.emit("birdAnimationDone");
    });
    if (this.isCurrentlyABird) {
      this.mainSprite.mesh.visible = false;
      this.birdSprite.mesh.visible = true;
      this.size = {
        width: 0.5,
        height: 0.5
      };
    } else {
      this.mainSprite.mesh.visible = true;
      this.birdSprite.mesh.visible = false;
      this.size = {
        width: 1,
        height: 1.5
      };
    }
    this.object3D.add(this.mainSprite.mesh);
    this.object3D.add(this.birdSprite.mesh);
    this.object3D.position.copy(this.position);
    this.setOpacity(1);
    this.behaviors.outOfBounds.init(this);
  }

  public setConversationProvider(
    getter: () => Conversation<string, string> | null
  ) {
    this.requestConversation = getter;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    // Add sensor to detect player.
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.size.width,
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
  destroy() {
    super.destroy();
    this.mainSprite.dispose();
    this.birdSprite.dispose();
  }
  setOpacity(opacity: number, ms: number = 500) {
    const initialOpacity = this.opacity;
    this.scheduler.cancel("fadeOpacity");
    this.scheduler.add({
      id: "fadeOpacity",
      duration: ms,
      invokeFunction: (t) => {
        this.opacity = initialOpacity * (1 - t) + opacity * t;
        this.mainSprite.setOpacity(this.opacity);
        this.birdSprite.setOpacity(this.opacity);
      },
      invokeFunctionAtComplete: () => {
        this.opacity = opacity;
        this.mainSprite.setOpacity(opacity);
        this.birdSprite.setOpacity(opacity);
      }
    });
  }
  step(ms: number) {
    super.step(ms);
    this.mainSprite.animate(ms);
    this.birdSprite.animate(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // Handle interactions.
    if (!this.sensor) return;
    let nearPlayer: PlayerAPI | undefined;
    if (this.enabled) {
      this.sensor.setTranslation(vector3To2(this.position));
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

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
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
    if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
    this.focusPrompt = undefined;
    const conversationData = this.requestConversation?.() ?? null;
    if (conversationData) this.converseWith(conversationData);
  }
  async converseWith(conversationData: Conversation<string, string>) {
    const { nearPlayer, level } = this;
    if (this.conversation || !nearPlayer || !level?.controls?.events) return;

    this.conversation = new OverlayConversation({
      position: this.position.clone(),
      conversation: conversationData
    });

    this.level?.state.setValue("inConversation", true);

    const convoPromise = typedEmitterPromise(
      this.conversation.conversationEvents,
      "complete"
    );
    this.level?.addEntity(this.conversation);
    level.cameraDirector.sendRequest({
      id: this.id,
      priority: CameraRequestPriority.SCRIPTED,
      size: new Vector2(8, 8),
      influence: 0
    });
    level.cameraDirector.lerpRequestInfluence(this.id, 1);
    nearPlayer.setMovementEnabled(false);

    // Position the player near Adana
    const targetPlayerPosition = this.position.clone();
    targetPlayerPosition.x -= 2;
    while (this.level) {
      if (Math.abs(targetPlayerPosition.x - nearPlayer.position.x) < 0.5) {
        if (nearPlayer.isFacingRight()) {
          nearPlayer.behaviors.data.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            0
          );
          break;
        } else {
          nearPlayer.behaviors.data.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            0.1
          );
        }
      } else {
        if (targetPlayerPosition.x > nearPlayer.position.x) {
          nearPlayer.behaviors.data.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            0.5
          );
        } else {
          nearPlayer.behaviors.data.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            -0.5
          );
        }
      }
      await typedEmitterPromise(this.level, EntityLevelEvents.Step);
    }

    // Do the conversation.
    await convoPromise;

    nearPlayer.setMovementEnabled(true);
    this.conversation.manualDetach();
    this.conversation = undefined;
    this.level?.state.setValue("inConversation", false);
    await level.cameraDirector.lerpRequestInfluence(this.id, 0);
    level.cameraDirector.removeRequests(this.id);
  }

  becomeBird() {
    if (this.birdSprite.mesh.visible) return;
    this.isCurrentlyABird = true;
    this.mainSprite.gotoTag("Transform A");
    this.mainSprite.playingAnimation = true;
    this.mainSprite.playingAnimationBackwards = false;
    this.spriteEvents.once("mainAnimationDone", () => {
      this.mainSprite.mesh.visible = false;
      this.birdSprite.mesh.visible = true;
      this.mainSprite.setOpacity(0);
      this.birdSprite.setOpacity(this.opacity);
      this.position.y -= 0.5 * this.object3D.scale.y;
      this.size = {
        width: 0.5 * this.object3D.scale.x,
        height: 0.5 * this.object3D.scale.y
      };
      this.events.emit(AdanaEvents.BirdModeActivated);
    });
  }
  becomeAnthro() {
    if (!this.birdSprite.mesh.visible) return;
    this.isCurrentlyABird = false;
    this.mainSprite.mesh.visible = true;
    this.birdSprite.mesh.visible = false;
    this.mainSprite.setOpacity(this.opacity);
    this.birdSprite.setOpacity(0);
    this.position.y += 0.5 * this.object3D.scale.y;
    this.mainSprite.gotoTag("Transform B");
    this.mainSprite.playingAnimation = true;
    this.mainSprite.playingAnimationBackwards = false;
    this.spriteEvents.once("mainAnimationDone", () => {
      this.mainSprite.gotoTag("Idle");
    });
    this.size = {
      width: 1 * this.object3D.scale.x,
      height: 1.5 * this.object3D.scale.y
    };
    this.events.emit(AdanaEvents.HumanoidModeActivated);
  }
  birdFly() {
    this.birdSprite.gotoTag("Takeoff");
    this.birdSprite.playingAnimation = true;
    this.birdSprite.playingAnimationBackwards = false;
    this.spriteEvents.once("birdAnimationDone", () => {
      this.birdSprite.gotoTag("Fly");
      this.events.emit(AdanaEvents.BirdModeFlying);
    });
  }
  birdLand() {
    this.birdSprite.gotoTag("Land");
    this.birdSprite.playingAnimation = true;
    this.birdSprite.playingAnimationBackwards = false;
    this.spriteEvents.once("birdAnimationDone", () => {
      this.birdSprite.gotoTag("Idle");
    });
  }
  flyTo(position: IVector2, duration: number) {
    const fromPosition = new Vector2(this.position.x, this.position.y);
    const toPosition = new Vector2(position.x, position.y);
    const flight = {
      from: fromPosition,
      to: toPosition,
      duration,
      progress: 0
    };
    this.flight = flight;
    this.scheduler.cancel("flight");
    this.scheduler.add({
      id: "flight",
      duration,
      invokeFunction: (t) => {
        const position = fromPosition.clone().lerp(toPosition, t);
        this.position.x = position.x;
        this.position.y = position.y;
        flight.progress = t;
      },
      invokeFunctionAtComplete: () => {
        this.flight = undefined;
        this.events.emit(AdanaEvents.BirdModeFlightDone);
      }
    });
  }
}
