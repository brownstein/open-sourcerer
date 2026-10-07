import { AIDirectives, BaseAIBehaviorTree } from "src/api/ai";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import { getPlayer } from "src/engine/util/levelUtil";

export class AIBehavior<TDirectives extends AIDirectives = {}>
  implements EntityBehavior
{
  public readonly type = "AIBehavior";

  private _behaviorTree?: BaseAIBehaviorTree<TDirectives>;

  private isOverrided = false;
  private desiredAIBehavior?: BaseAIBehaviorTree;

  constructor() {
    this.step = this.step.bind(this);
  }

  // NOTE: awesome set that allows any type of behvaior tree to be set here,
  // not just one with the same directives for easy hot swapping support
  set behaviorTree(behaviorTree: BaseAIBehaviorTree | undefined) {
    this.desiredAIBehavior = behaviorTree;

    if (this.isOverrided) return;
    if (this._behaviorTree !== behaviorTree) this.reset();

    this._behaviorTree = behaviorTree as BaseAIBehaviorTree<TDirectives>;
  }

  get isEnabled(): boolean {
    if (!this._behaviorTree) return false;

    return this._behaviorTree.isEnabled;
  }

  overrideAI(behaviorTree: BaseAIBehaviorTree): void {
    this.isOverrided = true;

    this.desiredAIBehavior = this._behaviorTree;
    if (this._behaviorTree !== behaviorTree) this.reset();

    // WARN: do not use the setter here
    this._behaviorTree = behaviorTree as BaseAIBehaviorTree<TDirectives>;
  }

  clearOverride(): void {
    this.isOverrided = false;
    this.behaviorTree = this.desiredAIBehavior;
  }

  disable(): void {
    this._behaviorTree?.disable();
  }

  enable(): void {
    this._behaviorTree?.enable();
  }

  reset(): void {
    this._behaviorTree?.reset();
  }

  dispatchDirective<
    DirectiveKey extends keyof TDirectives,
    KeyValue extends TDirectives[DirectiveKey]
  >(key: DirectiveKey, value: KeyValue): void {
    this._behaviorTree?.dispatchDirective(key, value);
  }

  readDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): TDirectives[DirectiveKey] | undefined {
    return this._behaviorTree?.readDirective(key);
  }

  clearDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): void {
    this._behaviorTree?.clearDirective(key);
  }

  init(entity: BaseEntityType): AIBehavior<TDirectives> {
    this.thisEntity = entity;

    return this;
  }

  attachToLevel(level: EntityLevelAPI): void {
    this.level = level;
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI) {
    this.level = undefined;
    level.off(EntityLevelEvents.Step, this.step);
  }

  private thisEntity?: BaseEntityType;
  private level?: LevelAPI;

  step(deltaMs: number): void {
    if (!this._behaviorTree) return;

    // NOTE: now, this AI behavior automatically handles filling in the
    // data property of the behavior tree if it is not already defined
    if (!this._behaviorTree.data) {
      if (!this.thisEntity || !this.level) return;

      this._behaviorTree.data = {
        deltaMs: 0,
        totalMs: 0,
        level: this.level,
        thisEntity: this.thisEntity
      };
    }

    if (!this._behaviorTree.data.player && this.level) {
      const player = getPlayer(this.level);
      if (player) {
        this._behaviorTree.data.player = player;
      }
    }

    this._behaviorTree.data.deltaMs = deltaMs;
    this._behaviorTree.data.totalMs += deltaMs;

    this._behaviorTree.run();
  }
}
