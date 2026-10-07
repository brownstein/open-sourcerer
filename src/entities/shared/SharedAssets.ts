import { Vector3 } from "three";

import { BaseEntityType, EntityLifecycleEventTypes, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { addResourceLoader } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import healthBarPng from "./sprites/health-bar-container.png";

@addResourceLoader(
  new TextureResourceLoader("health-bar-texture", healthBarPng)
)
export class SharedAssets implements BaseEntityType {
  static type = "SharedAssets";
  public type = "SharedAssets";

  // Everything from here down is just to convince the asset loading system that this
  // is an entity class. Please don't instantiate.
  public id = "SharedAssets";
  public position = new Vector3();
  public angle = 0;
  public size = { width: 0, height: 0 };
  public initialProps: EntityProps;
  public events = createTypedEventEmitter<EntityLifecycleEventTypes>();
  public behaviors = {};
  public lifetimeMs = 0;
  constructor(props: EntityProps) {
    this.initialProps = props;
  }
}
