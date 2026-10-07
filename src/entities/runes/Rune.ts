import { Color, Object3D, Vector2, Vector3 } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityLevelAPI,
  EntityProps,
  EntitySnapshot
} from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { itemCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import {
  ClazzDependencyLoader,
  TextureResourceLoader
} from "src/engine/loader/Loaders";
import { Text } from "src/entities/environment/Text";

import { DragAndDropBehavior } from "../shared/behaviors/DragAndDrop";
import {
  RuneEntityAPI,
  getRuneColor,
  isRuneAPI,
  runeConnectionFlag,
  runeFlag
} from "./behaviors/RuneBehaviorsShared";
import { RuneConnectivityBehavior } from "./behaviors/RuneConnectivity";
import { RunePhysicsBehavior } from "./behaviors/RunePhysics";
import { RuneSequenceBehavior } from "./behaviors/RuneSequence";
import {
  RuneSocketingRuneBehavior,
  RuneSocketingSocketBehavior,
  SocketEntityAPI
} from "./behaviors/RuneSocketing";
import { RuneValueBehavior, hasValueBehavior } from "./behaviors/RuneValue";
import runeTemplateJson from "./sprites/rune-template.json";
import runeTemplatePng from "./sprites/rune-template.png";

const runeTagSizes: Record<string, [number, number]> = {
  "1x1": [16, 16],
  "2x1": [32, 16],
  "3x1": [48, 16],
  "2x2": [32, 32],
  "1x2": [16, 32]
};

export type RuneProps = EntityProps & {
  bakedRune?: string;
  draggable?: boolean;
  createSocket?: boolean;
  collideWithPlayer?: boolean;
  autoSocket?: boolean;
  textFontOverride?: boolean;
};

@addResourceLoader(
  new TextureResourceLoader("runeTemplateTexture", runeTemplatePng)
)
class RuneDeps {
  static type = "RuneDeps";
}

@addResourceLoader(new ClazzDependencyLoader(RuneDeps))
export class Rune extends CoreEntity implements RuneEntityAPI {
  static type = "Rune";
  public type = "Rune";
  public readonly [runeFlag] = true;
  public readonly [runeConnectionFlag] = true;

  public object3D = new Object3D();
  public behaviors = {
    connectivity: new RuneConnectivityBehavior(),
    sequence: new RuneSequenceBehavior(),
    value: new RuneValueBehavior(),
    drag: new DragAndDropBehavior({ draggable: true }),
    physics: new RunePhysicsBehavior(),
    socketing: new RuneSocketingRuneBehavior()
  };

  public wallAttached = true;
  public createSocket = true;
  public draggable = false;
  public dragging = false;
  public autoSocket = false;
  public runicText = "";

  private blockSprite = new ThreeAseprite({
    texture: getResource(RuneDeps, "runeTemplateTexture"),
    sourceJSON: runeTemplateJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });

  private displayColor = new Color(0xffffff);
  private displayText?: Text;

  constructor(props: RuneProps) {
    super(props);
    this.behaviors.connectivity.init(this);
    this.behaviors.sequence.init(this);
    this.behaviors.drag.init(this);
    this.behaviors.physics.init(this).disable();
    this.behaviors.socketing.init(this);

    if (typeof props.bakedRune === "string") this.runicText = props.bakedRune;
    if (typeof props.draggable === "boolean") this.draggable = props.draggable;
    if (props.collideWithPlayer)
      this.behaviors.physics.setCollisionGroup(itemCollisionGroup);
    if (typeof props.autoSocket === "boolean")
      this.autoSocket = props.autoSocket;
    if (typeof props.createSocket === "boolean")
      this.createSocket = props.createSocket;

    this.behaviors.value.setValue(this.runicText, false, true);
    this.behaviors.drag.setDraggable(this.draggable);

    if (this.draggable && !this.createSocket) {
      this.behaviors.connectivity.disable();
      this.behaviors.sequence.disable();
    }

    let closestTag: string = "1x1";
    let closestTagSize = new Vector2(1, 1);
    let closestTagDiff = Number.POSITIVE_INFINITY;
    const thisSize = new Vector2(this.size.width, this.size.height);
    for (const [tagName, tagSizeRaw] of Object.entries(runeTagSizes)) {
      const tagSize = new Vector2(
        tagSizeRaw[0] * kInvPixelScale,
        tagSizeRaw[1] * kInvPixelScale
      );
      const tagDiff = tagSize.clone().sub(thisSize).length();
      if (tagDiff < closestTagDiff) {
        closestTagDiff = tagDiff;
        closestTag = tagName;
        closestTagSize = tagSize;
      }
    }
    this.blockSprite.gotoTag(closestTag);
    this.blockSprite.mesh.scale.x *= this.size.width / closestTagSize.x;
    this.blockSprite.mesh.scale.y *= this.size.height / closestTagSize.y;
    this.blockSprite.setLayerOpacities({
      Base: 1,
      Socket: 0
    });
    if (!this.draggable) this.blockSprite.setFade(0x666666, 0.5);
    this.blockSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.blockSprite.mesh.position.z -= 0.25;
    this.object3D.add(this.blockSprite.mesh);
    this.object3D.position.copy(this.position);

    this.displayText = new Text({
      position: this.position.clone(),
      text: this.runicText,
      textFont: props.textFontOverride
        ? "Highbirth"
        : !this.runicText.startsWith('"')
          ? "Highbirth"
          : "MSSN",
      textPixelSize: 9,
      textAlign: "center",
      textColor:
        "#" +
        new Color(
          getRuneColor(
            !!this.runicText && this.createSocket,
            !!this.runicText && this.createSocket,
            false,
            false
          )
        ).getHexString(),
      outline: true,
      outlineColor: "#446688"
    });

    this.behaviors.connectivity.events.on("connected", (other) => {
      if (isRuneAPI(other)) this.behaviors.sequence.attach(other);
    });
    this.behaviors.connectivity.events.on("disconnected", (other) => {
      if (isRuneAPI(other)) this.behaviors.sequence.detach(other);
    });
    this.behaviors.sequence.events.on("sequenceChanged", () => {
      this.recolor(getRuneColor(false, false, false, true));
    });
    this.behaviors.sequence.events.on("sequenceRefresh", (_seqs) => {
      this.recolor(getRuneColor(false, false, false, true));
    });
    this.behaviors.sequence.events.on("sequenceStartedRun", () => {
      this.recolor(getRuneColor(false, false, false, true));
    });
    this.behaviors.sequence.events.on(
      "sequenceCompletedRun",
      ([success, value]) => {
        this.recolor(getRuneColor(true, !!value, !success));
      }
    );
    this.behaviors.drag.events.on("dragStart", () => {
      this.dragging = true;
      this.recolor(getRuneColor(false, false, false, false));
      this.behaviors.sequence.disable();
      this.behaviors.connectivity.disable();
      if (this.behaviors.socketing.socket) {
        this.behaviors.socketing.detachFromSocket();
      }
      this.behaviors.physics.disable();
    });
    this.behaviors.drag.events.on("dragEnd", () => {
      this.dragging = false;
      this.behaviors.socketing.attemptSocket();
      if (!this.behaviors.socketing.socket) {
        this.behaviors.physics.enable();
      }
      this.behaviors.physics.teleport(this.position);
    });
    this.behaviors.socketing.events.on("socketed", (socket) => {
      if (socket) {
        this.animateToPosition(socket.position);
        this.behaviors.connectivity.enable();
        this.behaviors.sequence.enable();
        this.behaviors.physics.disable();
      }
    });
    this.behaviors.socketing.events.on("unsocketed", () => {
      this.behaviors.connectivity.disable();
      this.behaviors.sequence.disable();
      this.behaviors.physics.enable();
    });

    if (this.autoSocket) {
      this.scheduler.add({
        id: "autoSocket",
        duration: 250,
        recurring: true,
        invokeFunctionAtComplete: () => {
          if (!this.dragging && !this.behaviors.socketing.socket)
            this.behaviors.socketing.attemptSocket();
        }
      });
    }
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    if (this.draggable && this.createSocket) {
      const socket = new RuneSocket({
        position: this.position.clone(),
        size: this.size
      });
      level.addEntity(socket);
      this.behaviors.socketing.doInitialSocket(socket);
    }
    if (this.displayText) level?.addEntity(this.displayText);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    if (this.displayText) level?.removeEntity(this.displayText.id);
    super.detachFromLevel(level);
  }
  destroy(): void {
    super.destroy();
    this.blockSprite.dispose();
    this.displayText?.destroy();
  }
  recolor(color: ColorRepresentation, duration = 200) {
    const initialColor = this.displayColor.clone();
    const newColor = new Color(color);
    const newColorIsBright = newColor.getHSL({ h: 0, s: 0, l: 0 }).l > 0.45;
    this.scheduler.cancel("recolor");
    this.scheduler.add({
      id: "recolor",
      duration,
      invokeFunction: (t) => {
        this.displayColor.copy(initialColor).lerp(newColor, t);
        this.displayText?.recolor(this.displayColor);
        this.blockSprite?.setOutline(
          newColorIsBright ? 1 : 0,
          this.displayColor,
          0.5
        );
      },
      invokeFunctionAtComplete: () => {
        this.displayColor.set(color);
        this.displayText?.recolor(this.displayColor);
        this.blockSprite?.setOutline(
          newColorIsBright ? 1 : 0,
          this.displayColor,
          0.5
        );
      }
    });
  }
  step(ms: number) {
    super.step(ms);
    this.blockSprite.animate(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.displayText?.teleport(this.object3D.position);
  }
  applySnapshot(snapshot: EntitySnapshot): void {
    super.applySnapshot(snapshot);
    this.displayText?.teleport(this.object3D.position);
  }
  private animateToPosition(pos: Vector3, duration = 100) {
    const posStart = this.position.clone();
    this.behaviors.physics.disable();
    this.scheduler.cancel("animateToPosition");
    this.scheduler.add({
      id: "animateToPosition",
      duration,
      invokeFunction: (t) => {
        this.position.copy(posStart).lerp(pos, t);
      },
      invokeFunctionAtComplete: () => {
        this.position.copy(pos);
        this.behaviors.physics.teleport(pos);
      }
    });
  }
}

export type RuneValueRecipientProps = EntityProps & {
  fallback?: string;
};

@addResourceLoader(new ClazzDependencyLoader(RuneDeps))
export class RuneValueRecipient extends CoreEntity implements RuneEntityAPI {
  static type = "RuneValueRecipient";
  public type = "RuneValueRecipient";
  public readonly [runeFlag] = true;
  public readonly [runeConnectionFlag] = true;

  public object3D = new Object3D();
  public behaviors = {
    connectivity: new RuneConnectivityBehavior().updateConnectors([
      {
        id: "center",
        relativeOrigin: new Vector2(),
        radius: 0.25
      }
    ]),
    sequence: new RuneSequenceBehavior(),
    value: new RuneValueBehavior()
  };

  public runeValue = "";
  public fallback?: unknown;
  private blockSprite = new ThreeAseprite({
    texture: getResource(RuneDeps, "runeTemplateTexture"),
    sourceJSON: runeTemplateJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  private displayColor = new Color(0xffffff);
  private displayText: Text;

  constructor(props: RuneValueRecipientProps) {
    super(props);
    this.behaviors.connectivity.init(this);
    this.behaviors.sequence.init(this);

    if (props.fallback !== undefined) {
      this.fallback = props.fallback;
      this.behaviors.value.setValue(this.fallback, false, true);
    }

    let closestTag: string = "1x1";
    let closestTagSize = new Vector2(1, 1);
    let closestTagDiff = Number.POSITIVE_INFINITY;
    const thisSize = new Vector2(this.size.width, this.size.height);
    for (const [tagName, tagSizeRaw] of Object.entries(runeTagSizes)) {
      const tagSize = new Vector2(
        tagSizeRaw[0] * kInvPixelScale,
        tagSizeRaw[1] * kInvPixelScale
      );
      const tagDiff = tagSize.clone().sub(thisSize).length();
      if (tagDiff < closestTagDiff) {
        closestTagDiff = tagDiff;
        closestTag = tagName;
        closestTagSize = tagSize;
      }
    }
    this.blockSprite.gotoTag(closestTag);
    this.blockSprite.mesh.scale.x *= this.size.width / closestTagSize.x;
    this.blockSprite.mesh.scale.y *= this.size.height / closestTagSize.y;
    this.blockSprite.setLayerOpacities({
      Base: 1,
      Socket: 0
    });
    this.blockSprite.setFade(0x4488ff, 0.5);
    this.blockSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.blockSprite.mesh.position.z -= 0.25;
    this.object3D.add(this.blockSprite.mesh);
    this.object3D.position.copy(this.position);

    this.displayText = new Text({
      position: this.position.clone(),
      text: this.runeValue,
      textFont: "Highbirth",
      textPixelSize: 9,
      textAlign: "center",
      textColor:
        "#" +
        new Color(getRuneColor(false, false, false, false)).getHexString(),
      outline: true,
      outlineColor: "#446688"
    });

    this.behaviors.connectivity.events.on("connected", (other) => {
      if (isRuneAPI(other)) this.behaviors.sequence.attach(other);
    });
    this.behaviors.connectivity.events.on("disconnected", (other) => {
      if (isRuneAPI(other)) this.behaviors.sequence.detach(other);
    });
    this.behaviors.connectivity.events.on("connectedBy", (other) => {
      if (isRuneAPI(other)) return;
      if (hasValueBehavior(other)) {
        other.behaviors.value.events.on(
          "valueChanged",
          this.connectorValueUpdated
        );
        this.connectorValueUpdated(
          other.behaviors.value.error
            ? [false, other.behaviors.value.error]
            : [true, other.behaviors.value.getCodeValue()]
        );
      }
    });
    this.behaviors.connectivity.events.on("disconnectedBy", (other) => {
      if (isRuneAPI(other)) return;
      if (hasValueBehavior(other)) {
        other.behaviors.value.events.off(
          "valueChanged",
          this.connectorValueUpdated
        );
        this.connectorValueUpdated([true, this]);
      }
    });
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.level?.addEntity(this.displayText);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    if (this.displayText) level?.removeEntity(this.displayText.id);
    super.detachFromLevel(level);
  }
  destroy(): void {
    super.destroy();
    this.blockSprite.dispose();
    this.displayText?.destroy();
  }
  step(ms: number) {
    super.step(ms);
    this.blockSprite.animate(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    if (this.displayText) {
      this.displayText.position
        .copy(this.position)
        .multiplyScalar(kPixelScale)
        .round()
        .multiplyScalar(kInvPixelScale);
    }
  }
  private connectorValueUpdated = ([success, value]: [boolean, unknown]) => {
    if (success) {
      if (typeof value === "string") {
        this.behaviors.value.setValue(value, false, false);
      } else {
        this.behaviors.value.setValue(value, false, false);
      }
    } else {
      if (this.fallback !== undefined) {
        this.behaviors.value.setValue(this.fallback, false, true);
      } else {
        this.behaviors.value.setValue("", true, false);
      }
    }
    this.runeValue = this.behaviors.value.getCodeValue();
    this.recolor(getRuneColor(value !== undefined, !!value, !success));
    this.displayText.update(success ? this.runeValue : "!");
  };
  recolor(color: ColorRepresentation, duration = 200) {
    const initialColor = this.displayColor.clone();
    const newColor = new Color(color);
    const newColorIsBright = newColor.getHSL({ h: 0, s: 0, l: 0 }).l > 0.4;
    this.scheduler.cancel("recolor");
    this.scheduler.add({
      id: "recolor",
      duration,
      invokeFunction: (t) => {
        this.displayColor.copy(initialColor).lerp(newColor, t);
        this.displayText?.recolor(this.displayColor);
        this.blockSprite?.setOutline(
          newColorIsBright ? 1 : 0,
          this.displayColor,
          0.5
        );
      },
      invokeFunctionAtComplete: () => {
        this.displayColor.set(color);
        this.displayText?.recolor(this.displayColor);
        this.blockSprite?.setOutline(
          newColorIsBright ? 1 : 0,
          this.displayColor,
          0.5
        );
      }
    });
  }
}

@addResourceLoader(new ClazzDependencyLoader(RuneDeps))
export class RuneSocket
  extends CoreEntity
  implements BaseEntityType, SocketEntityAPI
{
  static type = "RuneSocket";
  public type = "RuneSocket";
  public behaviors = {
    socket: new RuneSocketingSocketBehavior()
  };
  public object3D = new Object3D();
  public sprite = new ThreeAseprite({
    texture: getResource(RuneDeps, "runeTemplateTexture"),
    sourceJSON: runeTemplateJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  constructor(props: EntityProps) {
    super(props);
    this.behaviors.socket.init(this);
    let closestTag: string = "1x1";
    let closestTagSize = new Vector2(1, 1);
    let closestTagDiff = Number.POSITIVE_INFINITY;
    const thisSize = new Vector2(this.size.width, this.size.height);
    for (const [tagName, tagSizeRaw] of Object.entries(runeTagSizes)) {
      const tagSize = new Vector2(
        tagSizeRaw[0] * kInvPixelScale,
        tagSizeRaw[1] * kInvPixelScale
      );
      const tagDiff = tagSize.clone().sub(thisSize).length();
      if (tagDiff < closestTagDiff) {
        closestTagDiff = tagDiff;
        closestTag = tagName;
        closestTagSize = tagSize;
      }
    }
    this.sprite.gotoTag(closestTag);
    this.sprite.mesh.scale.x *= this.size.width / closestTagSize.x;
    this.sprite.mesh.scale.y *= this.size.height / closestTagSize.y;
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.position.z--;
    this.sprite.setLayerOpacities({
      Base: 0,
      Socket: 1
    });
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
