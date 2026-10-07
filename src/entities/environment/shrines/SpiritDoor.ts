import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D, Vector3 } from "three";

import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addResourceLoader,
  getResource,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import {
  ClazzDependencyLoader,
  ProtoSpriteLoader
} from "src/engine/loader/Loaders";
import { PlayerShrineCoalesce } from "src/entities/player/PlayerShrineCoalesce";
import i18Next from "src/i18n/i18n";
import { levelsRegistry } from "src/levels/levels/allLevels";
import { selectLevelTransitionData } from "src/redux/gameState/selectors";
import { gotoLevel } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import { Player } from "../../player/Player";
import { isPlayerAPI } from "../../player/PlayerAPI";
import { GlowParticlesBehavior } from "../../shared/behaviors/GlowParticles";
import { Text } from "../Text";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "../behaviors/InteractionBehavior";
import * as spiritDoorTypes from "./sprites/spirit-door";
import spiritDoorPrs from "./sprites/spirit-door.prs";

const ROMAN_NUMERALS = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X"
];

function setTextOpacity(text: Text, value: number): void {
  text.opacity = value;
  const bm = (text as any).bmText;
  if (bm?.material?.uniforms?.opacity) {
    bm.material.uniforms.opacity.value = value;
    bm.material.uniformsNeedUpdate = true;
  }
}
const NUMERAL_GRADIENT_TOP = "#aae0ff";
const NUMERAL_GRADIENT_BOTTOM = "#4a5a8e";
const NUMERAL_SHADOW_COLOR = "#2a3058";
const NUMERAL_SHADOW_OFFSET = 0.02;
const NUMERAL_VERTICAL_OFFSET = -0.25;

function resolveShrineNumber(door: {
  name?: string;
  initialProps?: Record<string, unknown>;
}): number | undefined {
  const fromProp = door.initialProps?.shrineNumber;
  if (typeof fromProp === "number" && fromProp >= 1 && fromProp <= 10)
    return fromProp;
  const nameMatch = door.name?.match(/Door\s*(\d+)/i);
  return nameMatch ? parseInt(nameMatch[1], 10) : undefined;
}

export type SpiritDoorProps = EntityProps & {
  backWall?: boolean;
  facingRight?: boolean;
  hidden?: boolean;
  showDestination?: boolean;
  shrineNumber?: number;
  toLevel?: string;
  toDoor?: string;
};

@addResourceLoader(new ClazzDependencyLoader(Text))
@addResourceLoader(new ProtoSpriteLoader("SpiritDoorSheet", spiritDoorPrs))
@setConsumerDependencies(() => [Player])
export class SpiritDoor extends CoreEntity implements BaseEntityType {
  static type = "SpiritDoor";
  public type = SpiritDoor.type;
  public object3D = new Object3D();
  public behaviors = {
    interaction: new InteractionBehavior(),
    particles: new GlowParticlesBehavior()
  };

  private sprite = getResource<ProtoSpriteSheetThree>(
    SpiritDoor,
    "SpiritDoorSheet"
  ).getSprite<
    spiritDoorTypes.sprite_layers,
    spiritDoorTypes.sprite_animations
  >();
  private onWall = false;
  private facingRight = false;
  private hidden = false;
  private showDestination = false;
  private numeralText?: Text;
  private numeralShadowText?: Text;
  private outlineOpacity = 0;
  private attachedLevel?: EntityLevelAPI;
  public toLevel?: string;
  public toDoor?: string;

  constructor(props: SpiritDoorProps) {
    super(props);

    this.hidden = props.hidden ?? this.hidden;
    this.onWall = props.backWall ?? this.onWall;
    this.facingRight = props.facingRight ?? this.facingRight;
    this.showDestination = props.showDestination ?? this.showDestination;
    this.toLevel = props.toLevel ?? this.toLevel;
    this.toDoor = props.toDoor ?? this.toDoor;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.position.z = this.position.z - 0.5;
    this.object3D.add(this.sprite.mesh);

    this.sprite.gotoAnimation("idle");
    this.sprite.center();

    if (this.hidden) {
      this.behaviors.interaction.enabled = false;
      this.sprite.setOpacity(0);
      this.sprite.setAnimationSpeed(0);
      this.sprite.setAnimationLooping(false);
      this.sprite.gotoAnimation("appear");
    } else if (this.onWall) {
      this.sprite.gotoAnimation("front");
    } else {
      this.sprite.gotoAnimation("idle");
    }

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    if (this.facingRight) this.sprite.mesh.scale.x *= -1;

    this.behaviors.interaction.init(this);

    this.behaviors.particles.init(this);
    this.behaviors.particles.enableSpawn = false;
    this.behaviors.particles.maxParticles = 72;
    this.behaviors.particles.object3D.position.z = 0.5;
    this.behaviors.particles.particleSettings.color = new Color(0xaae8ff);
    this.behaviors.particles.particleSettings.outlineColor = new Color(
      0x2596be
    );
    this.behaviors.particles.particleSettings.outlineOpacity = 1;
    this.behaviors.particles.particleSettings.lifetimeMs = 1100;
    this.behaviors.particles.particleSettings.msBetweenSpawn = 20;
    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      if (ms === 0) {
        p.position.x = (Math.random() - 0.5) * (this.size?.width ?? 2) * 2;
        p.position.y = (Math.random() - 0.5) * (this.size?.height ?? 4) * 1.8;
        p.velocity.x = (Math.random() - 0.5) * 0.0008;
        p.velocity.y = (Math.random() - 0.5) * 0.0006;
      } else {
        p.position.y += Math.sin(ms * 0.007 + p.seed * 10) * 0.012;
        p.size = 0.12 * Math.sin((Math.PI * p.ms) / p.lifetimeMs);
        p.opacity *= 0.85 + 0.15 * Math.sin(ms * 0.01 + p.seed * 7);
      }
    };

    this.behaviors.interaction.events.on(
      InteractionProviderEvents.SetFocused,
      (focused) => {
        this.scheduler.cancel("outlineFade");
        const outlineColor = new Color(0xd4af37);
        const targetOpacity = 0.45;
        const outlineWidth = 0.8;
        const duration = 250;
        const startOpacity = this.outlineOpacity;

        this.behaviors.particles.enableSpawn = focused;

        if (focused) {
          this.scheduler.add({
            id: "outlineFade",
            duration,
            invokeFunction: (t) => {
              const eased = t * t * (3 - 2 * t);
              this.outlineOpacity =
                startOpacity + (targetOpacity - startOpacity) * eased;
              this.sprite.outlineAllLayers(
                outlineWidth,
                outlineColor,
                this.outlineOpacity,
                true
              );
            },
            invokeFunctionAtComplete: () => {
              this.outlineOpacity = targetOpacity;
              this.sprite.outlineAllLayers(
                outlineWidth,
                outlineColor,
                targetOpacity,
                true
              );
            }
          });
        } else {
          this.scheduler.add({
            id: "outlineFade",
            duration,
            invokeFunction: (t) => {
              const eased = t * t * (3 - 2 * t);
              this.outlineOpacity = startOpacity * (1 - eased);
              if (this.outlineOpacity > 0.01) {
                this.sprite.outlineAllLayers(
                  outlineWidth,
                  outlineColor,
                  this.outlineOpacity,
                  true
                );
              } else {
                this.sprite.outlineAllLayers(0, outlineColor, 0);
              }
            },
            invokeFunctionAtComplete: () => {
              this.outlineOpacity = 0;
              this.sprite.outlineAllLayers(0, outlineColor, 0);
            }
          });
        }
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.Interact,
      () => {
        if (!this.toLevel) return;
        store.dispatch(
          gotoLevel({
            levelId: this.toLevel,
            doorName: this.toDoor
          })
        );
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.IntersectingPlayer,
      (player) => {
        if (this.onWall) return;
        const dx = this.facingRight ? 1 : -1;
        if ((player.position.x - this.position.x) * dx < 0) {
          player.behaviors.physics.body?.applyImpulse({ x: dx, y: 0 }, true);
        }
      }
    );
  }
  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    this.attachedLevel = level;

    if (this.showDestination && this.toLevel) {
      const destLevel = levelsRegistry.get(this.toLevel);
      if (destLevel?.localizedName) {
        const labelPos = this.position
          .clone()
          .add(new Vector3(0, this.size.height / 2 + 0.5, 0));
        level
          .constructEntityAfterPreload("Text", {
            position: labelPos,
            text: String(i18Next.t(destLevel.localizedName as any)),
            troika: true,
            textFont: "Compass",
            textPixelSize: 8,
            textColor: "#ffffff",
            textAlign: "center",
            outline: true
          })
          .then((textEntity) => {
            if (textEntity) level.addEntity(textEntity);
          });
      }
    }

    const shrineNum = resolveShrineNumber(this);
    if (shrineNum !== undefined && !this.hidden) {
      const roman = ROMAN_NUMERALS[shrineNum] ?? String(shrineNum);
      const textProps = {
        position: this.position.clone(),
        text: roman,
        textFont: "Compass" as const,
        textPixelSize: 14,
        textAlign: "center" as const,
        outline: false
      };
      level
        .constructEntityAfterPreload<Text>("Text", {
          ...textProps,
          textColor: NUMERAL_SHADOW_COLOR
        })
        .then((shadowEntity) => {
          if (shadowEntity) {
            this.numeralShadowText = shadowEntity;
            shadowEntity.object3D.position.set(
              NUMERAL_SHADOW_OFFSET * 0.5,
              NUMERAL_VERTICAL_OFFSET - NUMERAL_SHADOW_OFFSET,
              0.05
            );
            setTextOpacity(shadowEntity, 0.45);
            this.object3D.add(shadowEntity.object3D);
          }
        });
      level
        .constructEntityAfterPreload<Text>("Text", {
          ...textProps,
          gradientColorTop: NUMERAL_GRADIENT_TOP,
          gradientColorBottom: NUMERAL_GRADIENT_BOTTOM,
          textColor: NUMERAL_GRADIENT_BOTTOM
        })
        .then((textEntity) => {
          if (textEntity) {
            this.numeralText = textEntity;
            textEntity.object3D.position.set(0, NUMERAL_VERTICAL_OFFSET, 0.1);
            this.object3D.add(textEntity.object3D);
          }
        });
    }

    level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
  }
  detachFromLevel(level: EntityLevelAPI) {
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    this.attachedLevel = undefined;
    super.detachFromLevel(level);
  }
  private readonly onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level) return;

    const transitionData = selectLevelTransitionData(store.getState());
    if (!transitionData.levelTransitionDoorName) return;

      // Primary match: this door leads to the level we just came from
      const prevLevelMatch =
        this.toLevel !== undefined &&
        this.toLevel === transitionData.previousLevelId;

      // Secondary match: this door's name matches the transition door name
      const nameMatch = this.name === transitionData.levelTransitionDoorName;
      const potentialBetterNameMatch = level.getEntityForName(
        transitionData.levelTransitionDoorName ?? "."
      );

      // Defer to a better match candidate if one exists.
      if (potentialBetterNameMatch && potentialBetterNameMatch !== this) return;

      if (prevLevelMatch) {
        // Best match - this door connects to the level we came from
      } else if (nameMatch) {
        // Check if another SpiritDoor has a better match via previousLevelId
        for (const entity of level.getEntities().values()) {
          if (
            entity !== this &&
            entity.type === SpiritDoor.type &&
            (entity as SpiritDoor).toLevel === transitionData.previousLevelId
          ) {
            return; // Let the better-matched door handle placement
          }
        }
      } else {
        return;
      }

      // Raycast downward from the door center to find the actual floor
      const ray = new level.rapier.Ray(
        { x: this.position.x, y: this.position.y },
        { x: 0, y: -1 }
      );
      const hit = level.world.castRay(
        ray,
        this.size.height + 2,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => !collider.isSensor()
      );
      const floorY =
        hit !== null
          ? this.position.y - hit.timeOfImpact
          : this.position.y - this.size.height / 2;

      const tpPosition = this.position.clone();
      tpPosition.y = floorY;

      // Find existing player or create one
      let player = [...level.getEntities().values()].find(isPlayerAPI);
      if (player) {
        tpPosition.y += player.size.height / 2;
        player.teleport?.(tpPosition);
      } else {
        // In shrine levels, PlayerShrineCoalesce may exist instead of Player.
        // Remove it and create a Player directly at the door position.
        for (const entity of level.getEntities().values()) {
          if (entity.type === PlayerShrineCoalesce.type) {
            level.removeEntity(entity.id);
            break;
          }
        }

        const newPlayer = new Player({ position: tpPosition });
        level.addEntity(newPlayer);
        tpPosition.y += newPlayer.size.height / 2;
        newPlayer.teleport?.(tpPosition);
        player = newPlayer;
      }

      // Walk the player onscreen for non-wall doors.
      // Note the delay in the player appearance - this is to allow the door enough time to open.
      if (!this.onWall && player) {
        const dx = this.facingRight ? 1 : -1;
        player.faceImmediate(this.facingRight);
        player.object3D.visible = false;
        this.scheduler.add({
          duration: 500,
          startIn: 1000,
          invokeFunctionAtStart: () => {
            player.object3D.visible = true;
            player.setMovementEnabled(true);
          },
          invokeFunction: () => {
            level.controls?.events.emit(
              ControlEvents.MoveHorizontally,
              dx * 0.5
            );
          },
          invokeFunctionAtComplete: () => {
            player.setMovementEnabled(true);
            level.controls?.events.emit(
              ControlEvents.MoveHorizontally,
              level.controls?.getCurrentHorizontalMotion() ?? 0
            );
          }
        });
      }
  };
  show(): void {
    if (!this.hidden) return;
    this.hidden = false;
    this.behaviors.interaction.enabled = true;
    this.sprite.setOpacity(1);
    this.sprite.setAnimationSpeed(1);
  }
  destroy(): void {
    if (this.numeralShadowText) {
      this.numeralShadowText.destroy();
      this.numeralShadowText = undefined;
    }
    if (this.numeralText) {
      this.numeralText.destroy();
      this.numeralText = undefined;
    }
    this.behaviors.particles.destroy?.();
    super.destroy();
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
}
