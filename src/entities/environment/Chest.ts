import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D } from "three";

import { EntityLevelAPI, EntityProps, EntitySnapshot } from "src/api/entity";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import { makeDefaultSpellIcon } from "src/components/ui/spells/spellIconDefaults";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { getCurrencyValueVariant } from "src/items/currencies/Currency";
import { builtInSpells } from "src/scripting/builtinScripts";
import { BuiltInScriptId } from "src/scripting/builtinScripts/keys";
import { isDevMode } from "src/util/devUtil";

import { EntityInventoryBehavior } from "../shared/behaviors/EntityInventoryBehavior";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "./behaviors/InteractionBehavior";
import { sprite_animations, sprite_layers } from "./sprites/chest/chest";
import chestPrs from "./sprites/chest/chest.prs";

export type ChestVariant = "stone" | "yellow" | "wood";

export type ChestProps = EntityProps & {
  spells?: BuiltInScriptId[];
  customSpells?: string[];
  equipment?: "sword";
  currency?: number;
  variant?: ChestVariant;
  devChest?: boolean;
};

export enum ChestEvents {
  Open = "Open"
}

function hashSpellCode(code: string) {
  let hash = 5381;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) + hash + code.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function customSpellToItemData(code: string, index: number, total: number) {
  const spell: SavedSpell = {
    id: `chest-custom-spell:${hashSpellCode(code)}`,
    name: total > 1 ? `Custom Spell ${index + 1}` : "Custom Spell",
    code,
    metadata: { icon: makeDefaultSpellIcon() }
  };
  return savedSpellToItemData(spell);
}

@addResourceLoader(new ProtoSpriteLoader("chestSheet", chestPrs))
export class Chest extends CoreEntity {
  static type = "Chest";
  public type = Chest.type;
  public chestEvents = createTypedEventEmitter<{
    [ChestEvents.Open]: void;
  }>();
  public object3D = new Object3D();
  public persist = true;

  public behaviors = {
    interaction: new InteractionBehavior(),
    inventory: new EntityInventoryBehavior()
  };

  private sprite = getResource<ProtoSpriteSheetThree>(
    Chest,
    "chestSheet"
  ).getSprite<sprite_layers, sprite_animations>();

  private variant: ChestVariant = "wood";
  private open = false;
  private opening = false;
  private empty = false;

  constructor(props: ChestProps) {
    super(props);

    const isDevChest = props.name === "DevChest" || !!props.devChest;
    const isDev = isDevMode();

    if (isDevChest && !isDev) return;

    this.variant = props.variant ?? this.variant;

    this.behaviors.interaction.init(this);
    this.behaviors.inventory.init(this);

    if (props.equipment) {
      if (props.equipment === "sword") {
        this.behaviors.inventory.items.push({
          type: "Sword"
        });
      }
    }
    if (props.spells) {
      for (const spellName of props.spells) {
        this.behaviors.inventory.items.push(
          savedSpellToItemData(builtInSpells[spellName])
        );
      }
    }
    if (props.customSpells) {
      const total = props.customSpells.length;
      props.customSpells.forEach((code, index) => {
        this.behaviors.inventory.items.push(
          customSpellToItemData(code, index, total)
        );
      });
    }
    if (props.currency) {
      this.behaviors.inventory.items.push({
        type: "Currency",
        variant: getCurrencyValueVariant(props.currency)
      });
    }

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.sprite.gotoFrame(0);
    this.sprite.setOpacity(0);
    switch (this.variant) {
      case "wood":
        this.sprite.setLayerOpacity(1, "chest-wood");
        break;
      case "stone":
        this.sprite.setLayerOpacity(1, "chest-stone");
        break;
      case "yellow":
        this.sprite.setLayerOpacity(1, "chest-yellow");
        break;
    }
    this.sprite.center();

    this.behaviors.interaction.events.on(
      InteractionProviderEvents.SetFocused,
      (focused) => {
        if (focused) {
          if (!this.open) {
            this.sprite.outlineAllLayers(1, new Color(0x44aaff), 1);
          }
        } else {
          this.sprite.outlineAllLayers(0, new Color(0xffffff), 0);
        }
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.Interact,
      (_withPlayer) => {
        if (this.open || this.opening) return;
        this.chestEvents.emit(ChestEvents.Open);
        this.opening = true;
        this.behaviors.inventory.open();
        this.behaviors.interaction.disable().setFocused(false);
        this.sprite.outlineAllLayers(0, new Color(), 0);
      }
    );
    this.behaviors.inventory.events.once("takeAll", () => {
      this.empty = true;
    });
    this.sprite.events.on("animationLooped", () => {
      this.opening = false;
      this.open = true;
      this.sprite.gotoFrame(-1);
    });
  }
  openImmediate() {
    this.open = true;
    this.behaviors.interaction.disable();
    this.sprite.gotoFrame(-1);
  }
  step(ms: number) {
    super.step(ms);
    if (this.opening) {
      this.sprite.advance(ms);
    }
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
  applySnapshot(snapshot: EntitySnapshot): void {
    if (snapshot.empty) {
      this.openImmediate();
      this.behaviors.inventory.items = [];
    }
  }
  getSnapshot(): EntitySnapshot {
    return {
      ...super.getSnapshot(),
      empty: this.empty
    };
  }
}
