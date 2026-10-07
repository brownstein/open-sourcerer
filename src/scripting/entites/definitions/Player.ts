import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { EntityInfo } from "../BaseEntityInfo";
import { IVector2 } from "three-aseprite";

type PlayerExtraInfo = {
  facingRight: boolean;
  swordUnsheathed: boolean;
  velocity: IVector2;
  health: number;
  mana: number;
};

@autoTranslateClass()
export class PlayerInfo extends EntityInfo<PlayerExtraInfo> {
  static type = "Player";
  
  @exposeProp()
  get health() {
    return this.extra?.health ?? 0;
  }

  @exposeProp()
  get mana() {
    return this.extra?.mana ?? 0;
  }

  @exposeProp()
  get facingRight() {
    return !!this.extra?.facingRight
  }
}