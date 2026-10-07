import { PlayerAPI } from "src/entities/player/PlayerAPI";

import { BaseEntityType, EntityBehavior, LevelAPI } from "./entity";
import { Writable } from "./util";

/**
 * The result type after ticking a node once.
 * {@link Succeeded}: This node has finished running and was successful
 * {@link Running}: This node is still running and has not produced a result yet
 * {@link Failed}: This node has finished running and failed
 */
export enum AIResult {
  Succeeded,
  Running,
  Failed
}

export type AIDirectives = Readonly<Record<string, unknown>>;

// NOTE: this is a temporary type so that I can define an entity type that can have any
// behavior key and it has to be check for being undefined and has to be constrained. This
// behavior stuff should be looked at at some point. TEMP...
export type BaseEntityTypeWithPartialBehaviorMap = Omit<
  BaseEntityType,
  "behaviors"
> & {
  readonly behaviors: Record<string, EntityBehavior<any> | undefined>;
};

/**
 * All data that must be passed down from the root of a tree all the way down to all AI nodes
 */
export type AINodeData = Readonly<{
  deltaMs: number;
  totalMs: number;
  level: LevelAPI;
  thisEntity: BaseEntityTypeWithPartialBehaviorMap;
  player?: PlayerAPI;

  /**
   * Used for defining key-value pairs that is read-write exposed to
   * influence a behavior tree
   *
   * @remark Dispatching and reading directives is done through the behavior tree interface
   */
  directives?: AIDirectives;
}>;

/**
 * The root interface for all nodes.
 */
export interface BaseAINode {
  /**
   * Executes the node's logic for a single tick.
   * @param data The node data passed down from the root behavior tree
   * @returns The result of the execution `(Succeeded, Running, or Failed)`
   */
  run(data: AINodeData): AIResult;

  /**
   * Resets the node's internal state to prepare for the next execution.
   *
   * @remark Parent nodes, such as selectors, automatically call the `.reset` method of all of its children when it is done executing
   * @remark This method is important for allowing for nodes to be *aborted* without breaking their internal state
   * @remark Must be idempotent, since this method gets called multiple times in a row by design
   */
  reset(): void;
}

/**
 * The root behavior tree that holds the root node of the tree
 */
export interface BaseAIBehaviorTree<TDirectives extends AIDirectives = {}> {
  /**
   * The data that will be passed down the tree.
   * @remark We bypass its mandatory `readonly` since the root behavior tree should be in charge of any mutations to the node data
   * @remark If this data property is not given the needed data, the tree will fail to run
   */
  data?: Writable<AINodeData>;

  disable(): void;
  enable(): void;
  reset(): void;

  get isEnabled(): boolean;

  /**
   * @remark no-op if data is not defined
   */
  dispatchDirective<
    DirectiveKey extends keyof TDirectives,
    KeyValue extends TDirectives[DirectiveKey]
  >(
    key: DirectiveKey,
    value: KeyValue
  ): void;

  readDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): TDirectives[DirectiveKey] | undefined;

  clearDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): void;

  /**
   * Tick the root node of the tree once.
   *
   * @remark Will fail to tick if the needed data is not supplied to the behavior tree
   */
  run(): void;
}

/**
 * The inputs of a node resolved into a shared interface.
 *
 * @remark
 * Nodes support 3 different variations of input types in their constructors,
 * so we call the static member of AINode `.ResolveInput` before we can work with them.
 * This static member returns a type matching this shared interface, making handling of the
 * inputs seamless for the consuming node.
 *
 * @example
 * ```ts
 * class ExampleNode extends AINode {
 *    private readonly number: AINodeResolvedInput<number>;
 *
 *    constructor(inNumber: AINodeInput<number>) {
 *      // AINodeInput<number> is a union of 3 different types, so we
 *      // resolve it to one shared interface
 *
 *      this.number = AINode.ResolveInput(inNumber);
 *    }
 *
 *    run(data) {
 *      // we can now access the value via the `.value` member,
 *      // regardless of which of the 3 union types was passed as input
 *      console.log(this.number.value)
 *    }
 * }
 * ```
 */
export interface AINodeResolvedInput<T> {
  readonly value: T;
}

/**
 * The input into a producer node (a Shared Variable)
 *
 * @remark
 * The return type of the static member of AINode `.CreateSharedVariable` returns
 * a type that matches this interfaces.
 *
 * @remark
 * This type is used to pass a shared variable into the node, in which it can
 * mutate the value directly by reference.
 *
 * @remark
 * This allows for any type to become a shared variable, even a primitive type
 */
export interface AINodeOutput<T> extends AINodeResolvedInput<T> {
  value: T;
}

/**
 * The union of the three different types of input into a consumer node.
 *
 * @template T
 * A constant/the raw input. This is baked into the node definition.
 * If you want to pass in dynamic data that can change values, do not
 * use this generic type.
 *
 * @template AINodeOutput<T>
 * A Shared Variable created via `AINode.CreateSharedVariable`.
 * This generic type allows us to pass in a shared variable, then
 * mutate that variable outside of the node to dynamically change
 * its behavior at runtime.
 *
 * @template () => T
 * A QOL syntax. If we simply want to pass dynamic data into a node
 * without needing to create a shared variable, then a callback
 * that returns that data can be passed as input. This is the
 * type to use if we are passing dynamic data into a consumer
 * node, which does not mutate the input it is given, only reads it.
 */
export type AINodeInput<T> = T | AINodeOutput<T> | (() => T);
