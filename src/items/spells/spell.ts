import {
  CanvasTexture,
  Color,
  HSL,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  Texture
} from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  ItemData,
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { SavedSpellAspect, isSpellItemData } from "src/api/spells";
import { SpellIconSpec } from "src/api/spellIcons";
import {
  preloadSpellIconImages,
  renderSpellIconToCanvas
} from "src/components/ui/spells/spellIconRenderer";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import closedScrollPng from "./sprites/scroll-closed.png";
import openScrollJson from "./sprites/scroll-open.json";
import openScrollPng from "./sprites/scroll-open.png";
import spellEmblemsJson from "./sprites/spell-emblems.json";
import spellEmblemsPng from "./sprites/spell-emblems.png";

export const kSupportedEmblems = [
  // Original icons.
  "Fire",
  "Ice",
  "Gravity",
  // Grt icons.
  "fire_single",
  "fire_multi",
  "fire_wall",
  "ice_cube",
  "ice_cube_multi",
  "ice_shards"
];

const ICON_CANVAS_SIZE = 128;

@assertStaticItemDefinitionProps
@addResourceLoader(
  new TextureResourceLoader("openScrollTexture", openScrollPng)
)
@addResourceLoader(
  new TextureResourceLoader("closedScrollTexture", closedScrollPng)
)
@addResourceLoader(
  new TextureResourceLoader("spellEmblemsTexture", spellEmblemsPng)
)
export class SpellDefinition {
  static type = "Spell";
  static getRenderInstance(props: ItemData): ItemRenderInstance {
    const spellData = isSpellItemData(props) ? props : null;
    const iconSpec = spellData?.scriptMetadata?.icon;

    // If a custom icon is set, render it instead of the scroll + emblem
    if (iconSpec && iconSpec.layers.length > 0) {
      return SpellDefinition._renderIcon(iconSpec);
    }

    const texture = getResource<Texture>(SpellDefinition, "openScrollTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: openScrollJson,
      frameName: (p) => `(${p.layerName}) ${p.frame}`
    });

    sprite.setLayerOpacities({
      Glow: 0
    });
    if (spellData?.scriptMetadata?.color) {
      sprite.setLayerColors({
        Stripe: spellData.scriptMetadata.color
      });
    }

    const emblemRaw = spellData?.scriptMetadata?.emblem;
    const emblemColor = spellData?.scriptMetadata?.emblemColor;
    let emblem = emblemRaw;
    if (!emblem && spellData?.scriptMetadata?.aspect) {
      switch (spellData.scriptMetadata?.aspect) {
        case SavedSpellAspect.Fire:
          emblem = "Fire";
          break;
        case SavedSpellAspect.Ice:
          emblem = "Ice";
          break;
        default:
          break;
      }
    }

    let needsEmblemSprite = false;
    if (emblem) {
      if (!sprite.getTags()[emblem]) {
        needsEmblemSprite = true;
      }
    }

    // Configure primary sprite.

    // Populate separate emblem sprite if we need one.
    let emblemSprite: ThreeAseprite | undefined;
    if (needsEmblemSprite) {
      const emblemTexture = getResource<Texture>(
        SpellDefinition,
        "spellEmblemsTexture"
      );
      emblemSprite = new ThreeAseprite({
        texture: emblemTexture,
        sourceJSON: spellEmblemsJson,
        frameName: (p) => `(${p.layerName}) ${p.frame}`
      });
      if (emblem) emblemSprite.gotoTag(emblem);
      if (emblemColor) {
        emblemSprite.setLayerOpacities({
          color: 0,
          grayscale: 1
        });
        emblemSprite.setLayerColors({
          greyscale: emblemColor
        });
      } else {
        emblemSprite.setLayerOpacities({
          color: 1,
          grayscale: 0
        });
      }
    } else {
      if (emblem) sprite.gotoTag(emblem);
      if (emblemColor) {
        const emblemColorAsColor = new Color(emblemColor);
        const hsl: HSL = {
          h: 0,
          s: 0,
          l: 0
        };
        const isBright = emblemColorAsColor.getHSL(hsl).l > 0.5;
        sprite.setLayerFades({
          Icon: [emblemColor, 1],
          "Icon Outline": isBright ? [0x0, 1] : [0xffffff, 1]
        });
      }
    }

    const rootObj = new Object3D();
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    rootObj.add(sprite.mesh);
    if (emblemSprite) {
      emblemSprite.mesh.scale.multiplyScalar(kInvPixelScale * 0.5);
      emblemSprite.mesh.position.z = 1;
      rootObj.add(emblemSprite.mesh);
    }
    return {
      object3D: rootObj,
      dispose: () => {
        sprite.dispose();
        emblemSprite?.dispose();
      }
    };
  }
  private static _renderIcon(iconSpec: SpellIconSpec): ItemRenderInstance {
    const canvas = renderSpellIconToCanvas(iconSpec, ICON_CANVAS_SIZE);
    const texture = new CanvasTexture(canvas ?? document.createElement("canvas"));
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.colorSpace = LinearSRGBColorSpace;

    const worldSize = ICON_CANVAS_SIZE * kInvPixelScale;
    const geometry = new PlaneGeometry(worldSize, worldSize);
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const mesh = new Mesh(geometry, material);

    return {
      object3D: mesh,
      dispose: () => {
        geometry.dispose();
        material.dispose();
        texture.dispose();
      },
    };
  }

  // Used by emblem selector.
  static getStandaloneEmblem(emblem: string, color?: boolean) {
    const baseTexture = getResource<Texture>(
      SpellDefinition,
      "openScrollTexture"
    );
    const baseSprite = new ThreeAseprite({
      texture: baseTexture,
      sourceJSON: openScrollJson,
      frameName: (p) => `(${p.layerName}) ${p.frame}`
    });
    const emblemTexture = getResource<Texture>(
      SpellDefinition,
      "spellEmblemsTexture"
    );
    const emblemSprite = new ThreeAseprite({
      texture: emblemTexture,
      sourceJSON: spellEmblemsJson,
      frameName: (p) => `(${p.layerName}) ${p.frame}`
    });
    if (baseSprite.getTags()[emblem]) {
      emblemSprite.dispose();
      // Apply the boundaries of the icon layer to the sprite.
      const baseSpriteBounds = baseSprite.getLayerBoundingBox(
        "Icon",
        emblem,
        0
      );
      if (baseSpriteBounds) {
        // There's a bug in ThreeAseprite where clipping does not match the
        // clipping we get back from getLayerBoundingBox, but instead requires
        // a manual offset.
        // TODO: Fix that!
        baseSpriteBounds.xMin += 32;
        baseSpriteBounds.xMax += 32;
        baseSpriteBounds.yMin += 32;
        baseSpriteBounds.yMax += 32;
        baseSprite.setClipping(baseSpriteBounds);
      }
      baseSprite.gotoTag(emblem);
      baseSprite.gotoTagFrame(0);
      baseSprite.setLayerOpacities({ Main: 0 });
      baseSprite.setLayerOpacities({ Icon: 1 });
      baseSprite.setFade(0x0, 1);
      return baseSprite;
    }
    if (emblemSprite.getTags()[emblem]) {
      baseSprite.dispose();
      emblemSprite.gotoTag(emblem);
      if (color) {
        emblemSprite.setLayerOpacities({ monochrome: 0 });
      } else {
        emblemSprite.setLayerOpacities({ color: 0 });
        emblemSprite.setFade(0x0, 1);
      }
      return emblemSprite;
    }
    return null;
  }
}

// Preload icon images at module init so they're cached by render time
preloadSpellIconImages();
