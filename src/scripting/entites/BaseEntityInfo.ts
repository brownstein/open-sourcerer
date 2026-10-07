import { autoTranslateClass, exposeProp } from "../core/Bindings";
import { JSRunnerAPI } from "../core/api";
import { SpellVector } from "../modules/shared/spellVector";
import {
  TrackedEntityPseudoAPI,
  TrackingIdentifier
} from "../runtime/SpellEntitySyncAPI";

// Bound wrapper class that we can use to keep entity
// info updated within the spell runtime.
@autoTranslateClass()
export class EntityInfo<
  T extends Record<string, unknown> = Record<string, unknown>
> implements TrackedEntityPseudoAPI
{
  static type = "EntityInfo";

  // This should be silently populated by the entity binding layer.
  // DO NOT EXPOSE THIS TO THE PSEUDO LAYER.
  public runner?: JSRunnerAPI;

  // This is automatically run when instantiating an entity within the runtime.
  // You can override it to return a Promise if you need to create something in
  // the level.
  postConstruct(runner: JSRunnerAPI) {
    this.runner = runner;
  }

  // Internal ID for tracking across levels.
  public trackingId: TrackingIdentifier = {};

  @exposeProp()
  public get id() {
    return this.trackingId.persistentHandleId;
  }

  @exposeProp()
  public type = "";

  @exposeProp()
  public isEnemy = false;

  @exposeProp()
  public position = new SpellVector();

  @exposeProp()
  public destroyed = false;

  @exposeProp()
  public extra: T | undefined;
}
