import { Object3D } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader } from "src/engine/entity/decorators";
import { ClazzDependencyLoader } from "src/engine/loader/Loaders";
import i18Next from "src/i18n/i18n";
import { levelsRegistry } from "src/levels/levels/allLevels";

import { Text } from "../Text";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "../behaviors/InteractionBehavior";
import { SpiritDoor } from "./SpiritDoor";

function resolveDoorLabel(door: SpiritDoor): string {
  const destLevel = door.toLevel
    ? levelsRegistry.get(door.toLevel)
    : undefined;
  if (destLevel?.localizedName) {
    return String(i18Next.t(destLevel.localizedName as any));
  }
  const hubLabel = (door as any).initialProps?.hubLabelText;
  if (hubLabel) return String(hubLabel);
  return door.name ?? "???";
}

function setTextOpacity(text: Text, value: number): void {
  text.opacity = value;
  const bm = (text as any).bmText;
  if (bm?.material?.uniforms?.opacity) {
    bm.material.uniforms.opacity.value = value;
    bm.material.uniformsNeedUpdate = true;
  }
}

const RISE_DISTANCE = 0.5;
const SHOW_DURATION = 800;
const HIDE_DURATION = 600;
const RIPPLE_FREQ = 3.0;
const RIPPLE_AMP = 0.04;

/** Match Roman numeral theme: gradient and subtle shadow. */
const GRADIENT_TOP = "#aae0ff";
const GRADIENT_BOTTOM = "#4a5a8e";
const SHADOW_COLOR = "#2a3058";
const SHADOW_OFFSET_X = 0.015;
const SHADOW_OFFSET_Y = -0.025;
const SHADOW_OPACITY = 0.65;
const TITLE_FONT_SIZE = 22;

@addResourceLoader(new ClazzDependencyLoader(Text))
export class ShrineHubTitleDisplay extends CoreEntity {
  static type = "ShrineHubTitleDisplay";
  public type = ShrineHubTitleDisplay.type;
  public object3D = new Object3D();

  private textEntity?: Text;
  private shadowEntity?: Text;
  private currentDoorId?: string;
  private baseY: number;
  private animPhase = 0;
  private idle = false;

  private doorFocusSubscriptions: {
    events: InteractionBehavior["events"];
    handler: (focused: boolean) => void;
  }[] = [];

  constructor(props: EntityProps) {
    super(props);
    this.baseY = this.position.y;
    this.object3D.position.z = 2;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    for (const entity of level.getEntities().values()) {
      if (entity.type !== SpiritDoor.type) continue;
      const door = entity as SpiritDoor;
      const events = door.behaviors.interaction.events;
      const handler = (focused: boolean): void => {
        if (focused) {
          this.showTitle(door);
        } else if (this.currentDoorId === door.id) {
          this.hideTitle();
        }
      };
      events.on(InteractionProviderEvents.SetFocused, handler);
      this.doorFocusSubscriptions.push({ events, handler });
    }
  }

  detachFromLevel(level: EntityLevelAPI): void {
    for (const { events, handler } of this.doorFocusSubscriptions) {
      events.off(InteractionProviderEvents.SetFocused, handler);
    }
    this.doorFocusSubscriptions = [];
    super.detachFromLevel(level);
  }

  step(ms: number): void {
    super.step(ms);
    if (!this.level) return;

    this.animPhase += ms;

    const { center } = this.level.cameraDirector.getCurrentProperties();
    this.object3D.position.x =
      Math.round(center.x * kPixelScale) * kInvPixelScale;
    this.object3D.position.y =
      Math.round(this.baseY * kPixelScale) * kInvPixelScale;

    if (this.idle && this.textEntity) {
      const t = this.animPhase * 0.001;
      const y = Math.sin(t * RIPPLE_FREQ) * RIPPLE_AMP;
      const x = Math.sin(t * RIPPLE_FREQ * 0.7 + 1.3) * RIPPLE_AMP * 0.4;
      this.textEntity.object3D.position.set(x, y, 0);
      if (this.shadowEntity) {
        this.shadowEntity.object3D.position.set(
          x + SHADOW_OFFSET_X,
          y + SHADOW_OFFSET_Y,
          -0.01
        );
      }
    }
  }

  private showTitle(door: SpiritDoor): void {
    const label = resolveDoorLabel(door);
    this.currentDoorId = door.id;
    this.animPhase = 0;
    this.idle = false;

    this.scheduler.cancel("titleShow");
    this.scheduler.cancel("titleHide");

    if (!this.textEntity) {
      this.shadowEntity = new Text({
        position: this.position.clone(),
        text: label,
        textFont: "Compass",
        textPixelSize: TITLE_FONT_SIZE,
        textColor: SHADOW_COLOR,
        textAlign: "center",
        outline: false
      });
      this.shadowEntity.object3D.position.set(
        SHADOW_OFFSET_X,
        -RISE_DISTANCE + SHADOW_OFFSET_Y,
        -0.01
      );
      setTextOpacity(this.shadowEntity, 0);
      this.object3D.add(this.shadowEntity.object3D);

      this.textEntity = new Text({
        position: this.position.clone(),
        text: label,
        textFont: "Compass",
        textPixelSize: TITLE_FONT_SIZE,
        textColor: GRADIENT_BOTTOM,
        textAlign: "center",
        outline: false,
        gradientColorTop: GRADIENT_TOP,
        gradientColorBottom: GRADIENT_BOTTOM
      });
      setTextOpacity(this.textEntity, 0);
      this.object3D.add(this.textEntity.object3D);
    } else {
      this.shadowEntity?.update(label);
      this.textEntity.update(label);
    }

    if (this.shadowEntity) {
      this.shadowEntity.object3D.visible = true;
      this.shadowEntity.object3D.position.set(
        SHADOW_OFFSET_X,
        -RISE_DISTANCE + SHADOW_OFFSET_Y,
        -0.01
      );
      setTextOpacity(this.shadowEntity, 0);
    }
    this.textEntity.object3D.visible = true;
    this.textEntity.object3D.position.set(0, -RISE_DISTANCE, 0);
    this.textEntity.object3D.scale.set(1, 1, 1);
    setTextOpacity(this.textEntity, 0);

    this.scheduler.add({
      id: "titleShow",
      duration: SHOW_DURATION,
      invokeFunction: (t) => {
        if (!this.textEntity) return;
        const eased = 1 - (1 - t) * (1 - t) * (1 - t);

        const fadeT = Math.max(0, Math.min(1, (t - 0.05) / 0.65));
        const opacity = fadeT * fadeT * (3 - 2 * fadeT);
        setTextOpacity(this.textEntity, opacity);
        if (this.shadowEntity) {
          setTextOpacity(this.shadowEntity, opacity * SHADOW_OPACITY);
        }

        const riseY = -RISE_DISTANCE * (1 - eased);
        const ripple =
          Math.sin(t * Math.PI * 4) * RIPPLE_AMP * 2 * (1 - eased);
        const wobble = Math.sin(t * Math.PI * 5) * 0.02 * (1 - eased);
        this.textEntity.object3D.position.set(wobble, riseY + ripple, 0);
        if (this.shadowEntity) {
          this.shadowEntity.object3D.position.set(
            wobble + SHADOW_OFFSET_X,
            riseY + ripple + SHADOW_OFFSET_Y,
            -0.01
          );
        }
      },
      invokeFunctionAtComplete: () => {
        this.idle = true;
        if (this.textEntity) {
          setTextOpacity(this.textEntity, 1);
          this.textEntity.object3D.position.set(0, 0, 0);
        }
        if (this.shadowEntity) {
          setTextOpacity(this.shadowEntity, SHADOW_OPACITY);
          this.shadowEntity.object3D.position.set(
            SHADOW_OFFSET_X,
            SHADOW_OFFSET_Y,
            -0.01
          );
        }
      }
    });
  }

  private hideTitle(): void {
    if (!this.textEntity) return;

    this.scheduler.cancel("titleShow");
    this.scheduler.cancel("titleHide");
    this.idle = false;

    const startOpacity = this.textEntity.opacity;
    const startY = this.textEntity.object3D.position.y;

    this.scheduler.add({
      id: "titleHide",
      duration: HIDE_DURATION,
      invokeFunction: (t) => {
        if (!this.textEntity) return;
        const eased = t * t;
        const opacity = startOpacity * (1 - eased);

        setTextOpacity(this.textEntity, opacity);
        if (this.shadowEntity) {
          setTextOpacity(this.shadowEntity, opacity * SHADOW_OPACITY);
        }

        const sinkY = startY - RISE_DISTANCE * 0.5 * eased;
        const ripple =
          Math.sin(t * Math.PI * 3) * RIPPLE_AMP * 1.5 * (1 - t);
        const wobble = Math.sin(t * Math.PI * 2) * 0.015 * (1 - t);
        this.textEntity.object3D.position.set(wobble, sinkY + ripple, 0);
        if (this.shadowEntity) {
          this.shadowEntity.object3D.position.set(
            wobble + SHADOW_OFFSET_X,
            sinkY + ripple + SHADOW_OFFSET_Y,
            -0.01
          );
        }
      },
      invokeFunctionAtComplete: () => {
        this.currentDoorId = undefined;
        if (this.textEntity) {
          setTextOpacity(this.textEntity, 0);
          this.textEntity.object3D.visible = false;
          this.textEntity.object3D.position.set(0, 0, 0);
          this.textEntity.object3D.scale.set(1, 1, 1);
        }
        if (this.shadowEntity) {
          setTextOpacity(this.shadowEntity, 0);
          this.shadowEntity.object3D.visible = false;
          this.shadowEntity.object3D.position.set(
            SHADOW_OFFSET_X,
            SHADOW_OFFSET_Y,
            -0.01
          );
        }
      }
    });
  }

  destroy(): void {
    super.destroy();
    if (this.shadowEntity) {
      this.shadowEntity.destroy();
      this.shadowEntity = undefined;
    }
    if (this.textEntity) {
      this.textEntity.destroy();
      this.textEntity = undefined;
    }
  }
}
