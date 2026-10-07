import { Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import {
  ClazzDependencyLoader,
  TextureResourceLoader
} from "src/engine/loader/Loaders";

import miscItemsJson from "./sprites/miscItems.json";
import miscItemsPng from "./sprites/miscItems.png";

@addResourceLoader(new TextureResourceLoader("miscItemsTexture", miscItemsPng))
export class QuestItemDeps {
  static type = "QuestItemDeps";
}

@assertStaticItemDefinitionProps
@addResourceLoader(new ClazzDependencyLoader(QuestItemDeps))
export class LogDefinition {
  static type = "Log";
  public type = "Log";
  static getRenderInstance(): ItemRenderInstance {
    const texture = getResource<Texture>(QuestItemDeps, "miscItemsTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: miscItemsJson,
      frameName: (p) => `${p.frame}`
    });

    sprite.gotoTag("Log");
    sprite.playingAnimation = false;
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
}

@assertStaticItemDefinitionProps
@addResourceLoader(new ClazzDependencyLoader(QuestItemDeps))
export class BookDefinition {
  static type = "Book";
  public type = "Book";
  static getRenderInstance(): ItemRenderInstance {
    const texture = getResource<Texture>(QuestItemDeps, "miscItemsTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: miscItemsJson,
      frameName: (p) => `${p.frame}`
    });

    sprite.gotoTag("Book");
    sprite.playingAnimation = false;
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
}
