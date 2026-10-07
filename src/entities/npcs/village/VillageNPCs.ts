import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Texture, Vector2, Vector3 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { CameraRequestPriority } from "src/api/camera";
import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityAlignment,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps
} from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import {
  inactiveCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { EmbeddedDoorway } from "src/entities/environment/EmbeddedDoorway";
import { PlayerPickup } from "src/entities/items/PlayerPickup";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "src/entities/player/PlayerAPI";
import { CharacterGroundPhysicsControlBehavior } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import {
  NavPathFollowingBehavior,
  PathFollowingBehaviorEvents
} from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { PopoverConversation } from "src/entities/ui/PopoverConversation";
import { selectQuestItemsMap } from "src/redux/inventory/selectors";
import { removeQuestItem } from "src/redux/inventory/slice";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

// import villageNpcsJson from "./sprites/village-npcs.json";
// import villageNpcsPng from "./sprites/village-npcs.png";
import blacksmithGoatJson from "./sprites/blacksmith-goat.json";
import blacksmithGoatPng from "./sprites/blacksmith-goat.png";

@addResourceLoader(
  new TextureResourceLoader("blacksmithGoatTexture", blacksmithGoatPng)
)
export class VillageNPC
  extends CoreEntity
  implements BaseEntityType, InteractionProvider
{
  static type = "VillageNPC";
  static matchAdditionalTypes = ["NPCBlacksmith"];
  public type = "VillageNPC";
  public alignment = EntityAlignment.NPC;
  public persist = true;
  public object3D = new Object3D();
  public currentlyInside = true;
  public nearPlayer?: PlayerAPI;

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(2.5),
    physics: new CharacterPhysicsBehavior(),
    physicsControl: new CharacterGroundPhysicsControlBehavior(),
    pathFollowing: new NavPathFollowingBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private enabled = true;
  private visible = true;
  private sprite: ThreeAseprite;
  private opacity = 1;
  private focused = false;
  private sensor?: Collider;
  private focusPrompt?: KeyboardKeyPrompt;
  private conversation?: PopoverConversation;
  private givingPlayerItem?: boolean;

  constructor(props: EntityProps) {
    super(props);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this).setGroup(inactiveCollisionGroup);
    this.behaviors.physicsControl
      .init(this)
      .attachPhysicsBehavior(this.behaviors.physics)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setSensorCollisionGroup(terrainSensorCollisionGroup)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities);
    this.behaviors.outOfBounds.init(this);

    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(VillageNPC, "blacksmithGoatTexture"),
      sourceJSON: blacksmithGoatJson,
      frameName: ({ frame }) => `${frame}`,
      offset: { x: -18, y: -7 },
      // This sheet is a little bugged because layers are merged.
      layers: ["Goat"]
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    // Wire in giving the player the bow.
    this.sprite.addTagFrameTrigger("GiveObject", 13, "itemAppears");

    this.sprite.gotoTag("Idle");
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    // Add sensor to detect player.
    // TODO: standardize this logic in a behavior.
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
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);

    // Handle inside/outside visibility.
    const door1 = this.level?.getEntityForName("Door1");
    let outside = false;
    if (door1) {
      outside = this.position.x > door1.position.x - 0.25;
    }
    const playerInside =
      this.level?.state.getValue<boolean | undefined>("playerInside") ?? false;
    const visible = playerInside !== outside;
    if (visible !== this.visible) {
      this.visible = visible;
      if (visible) {
        this.fadeIn();
      } else {
        this.fadeOut();
      }
    }

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
        if (!otherEntity) return;
        if (!isPlayerAPI(otherEntity)) return;
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
  fadeIn(ms: number = 500) {
    const startOpacity = this.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        this.opacity = startOpacity * (1 - t) + t;
        this.sprite.setOpacity(this.opacity);
      },
      invokeFunctionAtComplete: () => {
        this.opacity = 1;
        this.sprite.setOpacity(this.opacity);
      }
    });
  }
  fadeOut(ms: number = 500) {
    const startOpacity = this.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        this.opacity = startOpacity * (1 - t);
        this.sprite.setOpacity(this.opacity);
      },
      invokeFunctionAtComplete: () => {
        this.opacity = 0;
        this.sprite.setOpacity(this.opacity);
      }
    });
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
    this.converse();
  }
  getCurrentConversation(): PopoverConversation | null {
    const { nearPlayer, level } = this;
    if (!nearPlayer || !level?.controls?.events) return null;
    if (!this.level?.state.getValue("DialogPart1Done"))
      return new PopoverConversation({
        position: this.position.clone(),
        participants: [this, nearPlayer],
        lines: [
          {
            participantId: this.id,
            line: "Oh good, you're awake."
          },
          {
            participantId: nearPlayer.id,
            line: "Yep."
          },
          {
            participantId: this.id,
            line: "It's mid-morning already - let's get to work!"
          },
          {
            participantId: nearPlayer.id,
            line: "Sounds good, I'll follow you."
          }
        ],
        onComplete: () => {
          const marker = level.getEntityForName("Marker1");
          if (!marker) return;
          this.behaviors.pathFollowing.planAndFollowPathToPosition(
            vector3To2(marker.position)
          );
          const door1 = this.level?.getEntityForName("Door1") as
            | EmbeddedDoorway
            | undefined;
          door1?.enable();
          level.state.setValue("DialogPart1Done", true);
          this.disable();
          this.behaviors.pathFollowing.pathEvents.once(
            PathFollowingBehaviorEvents.PathPlanned,
            () => {
              this.sprite.gotoTag("Walk");
              this.sprite.mesh.scale.x = -kInvPixelScale;
            }
          );
          this.behaviors.pathFollowing.pathEvents.once(
            PathFollowingBehaviorEvents.PathComplete,
            () => {
              this.enable();
              this.sprite.gotoTag("Idle");
              this.sprite.mesh.scale.x = kInvPixelScale;
            }
          );
        }
      });
    if (!this.level?.state.getValue("DialogPart2Done"))
      return new PopoverConversation({
        position: this.position.clone(),
        participants: [this, nearPlayer],
        lines: [
          {
            participantId: this.id,
            line: "Now that you're here, let's get started. Go outside and grab some wood for the fire."
          }
        ],
        onComplete: () => {
          level.state.setValue("DialogPart2Done", true);
        }
      });
    if (
      !this.level?.state.getValue("DialogPart4Done") &&
      !selectQuestItemsMap(store.getState())["Log"]
    ) {
      return new PopoverConversation({
        position: this.position.clone(),
        participants: [this],
        lines: [
          {
            participantId: this.id,
            line: "Go get the wood!"
          }
        ]
      });
    }
    if (!this.level?.state.getValue("DialogPart3Done")) {
      store.dispatch(removeQuestItem({ itemType: "Log" }));
      return new PopoverConversation({
        position: this.position.clone(),
        participants: [this, nearPlayer],
        lines: [
          {
            participantId: this.id,
            line: "Alright, now I'm gonna use some magic to start the fire. Pay attention."
          },
          {
            participantId: nearPlayer.id,
            line: "This arcane stuff you're doing all seems like nonsense to me."
          },
          {
            participantId: this.id,
            line: "Fair enough. Now watch as I bring these two magic runestones I found together to spark the flame."
          },
          {
            participantId: nearPlayer.id,
            line: "So like, rub two rocks together?"
          },
          {
            participantId: this.id,
            line: "You know, it is kind of like that..."
          },
          {
            participantId: this.id,
            line: "All done... go grab some more wood?"
          }
        ],
        onComplete: () => {
          level.state.setValue("DialogPart3Done", true);
        }
      });
    }
    if (!level.state.getValue("DialogPart4Done")) {
      store.dispatch(removeQuestItem({ itemType: "Log" }));
      return new PopoverConversation({
        position: this.position.clone(),
        participants: [this, nearPlayer],
        lines: [
          {
            participantId: this.id,
            line: "Good heavens, an earthquake!"
          },
          {
            participantId: nearPlayer.id,
            line: "Are you OK?"
          },
          {
            participantId: this.id,
            line: "Yeah, but now there's this hole in my floor..."
          },
          {
            participantId: nearPlayer.id,
            line: "...Neat."
          },
          {
            participantId: this.id,
            line: "Go see what's down there!"
          },
          {
            participantId: this.id,
            line: "Also, it's too dangerous to go alone, take this!",
            onComplete: () => {
              this.givePlayerItem(nearPlayer, "Bow");
            }
          }
        ],
        onComplete: () => {
          level.state.setValue("DialogPart4Done", true);
        }
      });
    }

    return new PopoverConversation({
      position: this.position.clone(),
      participants: [this],
      lines: [
        {
          participantId: this.id,
          line: "Get to it!"
        }
      ]
    });
  }
  givePlayerItem(nearPlayer: PlayerAPI, itemType: string, itemScale = 0.5) {
    this.givingPlayerItem = true;
    const onItemAppears = () => {
      const giveItemOffset = new Vector3(-0.5, 1, 0);
      const givingItem = new PlayerPickup({
        position: this.position.clone().add(giveItemOffset),
        itemType,
        itemScale,
        toHotbar: true
      });
      this.level?.addEntity(givingItem);
      const onAnimationEnd = () => {
        this.sprite.removeEventListener(
          StandardEvents.animationComplete,
          onAnimationEnd
        );
        this.sprite.gotoTagFrame(15);
        this.sprite.playingAnimation = false;
        store.dispatch(
          enableUIElements([EnableElements.HotBar, EnableElements.Health])
        );
        this.scheduler.add({
          id: "itemTransfer",
          duration: 2000,
          invokeFunctionAtComplete: () => {
            givingItem.pickup(() => {
              this.level?.state.setValue("inConversation", false);
              this.givingPlayerItem = false;
              nearPlayer?.setMovementEnabled(true);
              this.level?.ctx?.saveStore?.saveGame();
            });
            this.sprite.gotoTag("Idle");
            this.sprite.playingAnimation = true;
          }
        });
      };
      this.sprite.addEventListener(
        StandardEvents.animationComplete,
        onAnimationEnd
      );
      this.sprite.removeEventListener("itemAppears", onItemAppears);
    };
    this.sprite.addEventListener("itemAppears", onItemAppears);
    this.sprite.gotoTag("GiveObject");
  }
  async converse() {
    const { nearPlayer, level } = this;
    if (this.conversation || !nearPlayer || !level?.controls?.events) return;
    this.conversation = this.getCurrentConversation() ?? undefined;
    if (!this.conversation) return;
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

    // Position the player. This is still experimental.
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

    if (!this.givingPlayerItem) nearPlayer.setMovementEnabled(true);
    this.conversation.gracefullyExit();
    this.conversation = undefined;
    if (!this.givingPlayerItem)
      this.level?.state.setValue("inConversation", false);
    await level.cameraDirector.lerpRequestInfluence(this.id, 0);
    level.cameraDirector.removeRequests(this.id);
  }
}
