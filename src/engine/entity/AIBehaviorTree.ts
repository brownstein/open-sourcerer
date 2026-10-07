import {
  AIDirectives,
  AINodeData,
  AINodeInput,
  AINodeOutput,
  AINodeResolvedInput,
  AIResult,
  BaseAIBehaviorTree,
  BaseAINode
} from "src/api/ai";
import { Writable } from "src/api/util";

class SharedCallback<T> implements AINodeResolvedInput<T> {
  private _callbackFn: () => T;

  constructor(callbackFn: () => T) {
    this._callbackFn = callbackFn;
  }

  get value(): T {
    return this._callbackFn();
  }
}

class SharedVariable<T> implements AINodeOutput<T> {
  private _value: T;

  constructor(value: T) {
    this._value = value;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    this._value = newValue;
  }
}

export abstract class AINode implements BaseAINode {
  abstract run(data: AINodeData): AIResult;

  /*
   * WARN: when overriding, make sure the reset logic is idempotent
   */
  reset(): void {}

  /*
   * WARN: we allow undefined here for QOL, but this
   *        mean we must make sure this shared variable is given to a producer first thing
   */
  static readonly CreateSharedVariable = <T>(
    value: T | undefined = undefined
  ): AINodeOutput<T> => {
    return new SharedVariable(value as T);
  };

  /*
   * WARN: All inputs into nodes must be resolved with this utility
   */
  static readonly ResolveInput = <T>(
    nodeInput: AINodeInput<T>
  ): AINodeResolvedInput<T> => {
    if (nodeInput instanceof SharedVariable) return nodeInput;
    if (nodeInput instanceof SharedCallback) return nodeInput;
    if (typeof nodeInput === "function")
      return new SharedCallback(nodeInput as () => T);

    return new SharedVariable(nodeInput as T);
  };
}

export abstract class AICompositeNode extends AINode {
  protected readonly children: AINode[];
  protected currentlyRunningChild: AINode | undefined = undefined;

  constructor(...children: AINode[]) {
    super();

    this.children = children;
  }

  reset(): void {
    if (this.currentlyRunningChild) {
      this.currentlyRunningChild.reset();
      this.currentlyRunningChild = undefined;
    }
  }
}

export abstract class AIParallelNode extends AINode {
  protected readonly children: AINode[];
  protected readonly finishedRunningChildren: Set<AINode> = new Set();

  constructor(...children: AINode[]) {
    super();

    this.children = children;
  }

  reset(): void {
    this.children.forEach((child) => {
      if (!this.finishedRunningChildren.has(child)) child.reset();
    });

    this.finishedRunningChildren.clear();
  }
}

export abstract class AIDecoratorNode extends AINode {
  protected child: AINode;

  constructor(child: AINode) {
    super();

    this.child = child;
  }

  reset(): void {
    this.child.reset();
  }
}

export class AIBehaviorTree<TDirectives extends AIDirectives = {}>
  implements BaseAIBehaviorTree<TDirectives>
{
  public data?: Writable<AINodeData>;

  private readonly root: AINode;
  private isDisabled = false;

  constructor(tree: AINode) {
    this.root = tree;
  }

  disable(): void {
    this.reset();
    this.isDisabled = true;
  }
  enable(): void {
    this.isDisabled = false;
  }

  reset(): void {
    this.root.reset();
  }

  get isEnabled(): boolean {
    return !this.isDisabled;
  }

  dispatchDirective<
    DirectiveKey extends keyof TDirectives,
    KeyValue extends TDirectives[DirectiveKey]
  >(key: DirectiveKey, value: KeyValue): void {
    if (!this.data) return;

    if (!this.data.directives) this.data.directives = {};

    const directives = this.data.directives as {
      [Key in DirectiveKey]: typeof value;
    };
    directives[key] = value;
  }

  readDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): TDirectives[DirectiveKey] | undefined {
    if (!this.data?.directives) return undefined;

    const directives = this.data.directives as {
      [Key in DirectiveKey]: TDirectives[DirectiveKey];
    };
    return directives[key];
  }

  clearDirective<DirectiveKey extends keyof TDirectives>(
    key: DirectiveKey
  ): void {
    if (!this.data?.directives) return;

    const directives = this.data.directives as {
      [Key in DirectiveKey]: unknown;
    };

    directives[key] = undefined;
  }

  run(): void {
    if (this.isDisabled) return;
    if (!this.data) return;

    const result = this.root.run(this.data);

    if (result !== AIResult.Running) this.reset();

    return;
  }
}

/*
 * TURNING AINODE CLASSES INTO GENERATOR FUNCTIONS UTILITY BELOW
 */

type AINodeClass = new (...args: any[]) => AINode;

type AINodeClassWrapper<TNodeClass extends AINodeClass> = (
  ...args: ConstructorParameters<TNodeClass>
) => InstanceType<TNodeClass>;

export function createNode<TNodeClass extends AINodeClass>(
  NodeClass: TNodeClass
): AINodeClassWrapper<TNodeClass> {
  return (...args: ConstructorParameters<TNodeClass>) =>
    new NodeClass(...args) as InstanceType<TNodeClass>;
}
