import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import { Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";

import { BeanBot } from "../npcs/bean-bot/BeanBot";
import { PlayerAPI } from "../player/PlayerAPI";
import cavesEndGatePrs from "./sprites/caves-end-gate/caves-end-gate.prs";
import type {
  CavesEndGateAnimation,
  CavesEndGateLayer
} from "./sprites/caves-end-gate/caves-end-gate.ts";

type CavesEndGateSprite =
  | ProtoSpriteThree<CavesEndGateLayer, CavesEndGateAnimation>
  | undefined;

export type CavesEndGateProps = EntityProps & {};

@addResourceLoader(new ProtoSpriteLoader("cavesEndGateSheet", cavesEndGatePrs))
export class CavesEndGate extends CoreEntity {
  static readonly type = "CavesEndGate";
  public readonly type = CavesEndGate.type;

  public object3D = new Object3D();
  private shouldOpen = false;
  private playerDepthValue: number = 0;
  private backLayerSprite: CavesEndGateSprite;
  private middleLayerSprite: CavesEndGateSprite;
  private frontLayerSprite: CavesEndGateSprite;

  private readonly OPENING_ANIMATION_SPEED = 0.3;

  constructor(props: CavesEndGateProps) {
    super(props);

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // this should be set to the same z coordinate as the player via level scripting and the
    // helper `syncWithPlayerDepthValue` function
    this.object3D.position.z = 0;

    this._setupSpritesForEachLayer();
  }

  syncWithPlayerDepthValue(player: PlayerAPI): void {
    this.playerDepthValue = player.position.z;
    this.object3D.position.z = this.playerDepthValue;
  }

  setBeanBotDepthValue(beanBot: BeanBot): void {
    const OFFSET_TO_APPEAR_IN_END_GATE_HOLE = 3;
    const newBeanBotDepthValue =
      this.playerDepthValue + OFFSET_TO_APPEAR_IN_END_GATE_HOLE;
    beanBot.teleport(beanBot.position.clone().setZ(newBeanBotDepthValue));
  }

  open(): void {
    this.shouldOpen = true;
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    if (!this.shouldOpen) return;

    if (this.backLayerSprite) this.backLayerSprite.advance(deltaMs);
    if (this.middleLayerSprite) this.middleLayerSprite.advance(deltaMs);
    if (this.frontLayerSprite) this.frontLayerSprite.advance(deltaMs);
  }

  destroy(): void {
    super.destroy();
    if (this.backLayerSprite) this.backLayerSprite.dispose();
    if (this.middleLayerSprite) this.middleLayerSprite.dispose();
    if (this.frontLayerSprite) this.frontLayerSprite.dispose();
  }

  private _setupSpritesForEachLayer(): void {
    this.backLayerSprite = getResource<ProtoSpriteSheetThree>(
      CavesEndGate,
      "cavesEndGateSheet"
    ).getSprite<CavesEndGateLayer, CavesEndGateAnimation>();

    this.middleLayerSprite = this.backLayerSprite.clone();
    this.frontLayerSprite = this.backLayerSprite.clone();

    this.backLayerSprite.center();
    this.backLayerSprite.mesh.scale.y *= -1;
    this.backLayerSprite.setAnimationLooping(false);
    this.backLayerSprite.setAnimationSpeed(this.OPENING_ANIMATION_SPEED);
    this.backLayerSprite.events.once("animationTagStarted", () =>
      this.backLayerSprite?.setAnimationSpeed(0)
    );

    this.middleLayerSprite.center();
    this.middleLayerSprite.mesh.scale.y *= -1;
    this.middleLayerSprite.setAnimationLooping(false);
    this.middleLayerSprite.setAnimationSpeed(this.OPENING_ANIMATION_SPEED);
    this.middleLayerSprite.events.once("animationTagStarted", () =>
      this.middleLayerSprite?.setAnimationSpeed(0)
    );

    this.frontLayerSprite.center();
    this.frontLayerSprite.mesh.scale.y *= -1;
    this.frontLayerSprite.setAnimationLooping(false);
    this.frontLayerSprite.setAnimationSpeed(this.OPENING_ANIMATION_SPEED);
    this.frontLayerSprite.events.once("animationTagStarted", () =>
      this.frontLayerSprite?.setAnimationSpeed(0)
    );

    this.backLayerSprite.hideLayers("middle", "front");
    this.middleLayerSprite.hideLayers("back", "front");
    this.frontLayerSprite.hideLayers("back", "middle");

    // the parent Object3D is set to the same Z position as the player
    // so, we sandwich Z-coord = 0
    // NOTE: PLAYER TAKES UP TWO DEPTH VALUES (SHIRT IS ONE DEPTH VALUE AHEAD)
    this.backLayerSprite.mesh.position.z = -1;
    this.middleLayerSprite.mesh.position.z = 2;

    // the beanbot of the caves level will be set to be 3 depth values higher than the player depth value
    // so, we sandwich Z-coord = 3
    // NOTE: I do not know why... but this needs to have a super high z-coord for it to actually work. No idea why
    this.frontLayerSprite.mesh.position.z = 100;

    this.object3D.add(
      this.backLayerSprite.mesh,
      this.middleLayerSprite.mesh,
      this.frontLayerSprite.mesh
    );
  }
}
