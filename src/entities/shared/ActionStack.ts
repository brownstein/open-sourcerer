export type ActionCB<EntityType, ArgType = never> = (
  entity: EntityType,
  arg?: ArgType
) => void;
export type StepGenNext = number;
export type ActionGenerator<YieldType> = Generator<
  YieldType | void,
  YieldType | void,
  StepGenNext
>;
export type ActionRunCB<EntityType, ArgType, YieldType> = (
  entity: EntityType,
  arg?: ArgType
) => ActionGenerator<YieldType>;

export type ActionType<
  EntityType,
  ActionNamesType,
  ArgType,
  YieldArgType extends unknown | never = never
> = {
  default?: boolean;
  init?: ActionCB<EntityType, ArgType>;
  resume?: ActionCB<EntityType, ArgType>;
  run?: ActionRunCB<
    EntityType,
    ArgType,
    ActionNamesType | [ActionNamesType, YieldArgType]
  >;
  done?: ActionCB<EntityType>;
};

type RunningAction<ActionNamesType, YieldArgType extends unknown = unknown> = {
  name: ActionNamesType;
  runningGen?: ActionGenerator<
    ActionNamesType | [ActionNamesType, YieldArgType]
  >;
};

type ExtractArgs<T> = T extends (...args: infer A) => any ? A : never;
type ExtractActionTypeArg<
  EntityType,
  ActionNamesType,
  T extends ActionType<EntityType, ActionNamesType, unknown, unknown | never>
> = ExtractArgs<T["run"]>[1] | ExtractArgs<T["resume"]>[1];

export class ActionStack<
  EntityType,
  ActionNamesType extends keyof ActionsLibType,
  ActionsLibType extends Record<
    string,
    ActionType<EntityType, ActionNamesType, unknown, ActionNamesType>
  >
> {
  public readonly actions: ActionsLibType;
  protected entity: EntityType;
  protected actionStack: RunningAction<ActionNamesType, ActionNamesType>[] = [];
  protected defaultAction?: ActionNamesType;
  constructor(entity: EntityType, actionsLib: ActionsLibType) {
    this.entity = entity;
    this.actions = actionsLib;
    for (const actionName in actionsLib) {
      const action = actionsLib[actionName];
      if (action.default) {
        this.defaultAction = actionName as unknown as ActionNamesType;
      }
    }
    this.beginDefaultAction();
  }
  currentAction() {
    return this.actionStack.at(-1)?.name ?? null;
  }
  beginDefaultAction() {
    if (this.defaultAction && this.actionStack.length === 0) {
      this._startAction(this.defaultAction);
    }
  }
  beginAction<AN extends ActionNamesType>(
    actionName: AN,
    arg?: ExtractActionTypeArg<EntityType, ActionNamesType, ActionsLibType[AN]>,
    guardExecuting = true,
    guardExecutingAnyDepth = false
  ) {
    if (guardExecuting && this.actionStack.at(-1)?.name === actionName) return;
    if (
      guardExecutingAnyDepth &&
      this.actionStack.find((a) => a.name === actionName)
    )
      return;
    this._startAction(actionName, arg);
  }
  stopAction(actionName?: ActionNamesType, stopAll = false) {
    if (this.actionStack.length === 0) return;
    const currentActionState = this.actionStack.at(-1);
    if (currentActionState === undefined) return;
    if (actionName === undefined) {
      this._endAction(currentActionState);
      return;
    }
    if (stopAll) {
      for (const actionState of this.actionStack) {
        if (actionState.name === actionName) {
          this._endAction(actionState);
        }
      }
      return;
    }
    if (actionName) {
      if (currentActionState.name === actionName) {
        this._endAction(currentActionState);
      }
    } else {
      this._endAction(currentActionState);
    }
  }
  hasActionInStack(actionName: ActionNamesType) {
    return !!this.actionStack.find((a) => a.name === actionName);
  }
  clearActionStack() {
    for (let i = this.actionStack.length - 1; i >= 0; i--) {
      this._endAction(this.actionStack[i]);
    }
  }
  step(ms: number) {
    const currentActionState = this.actionStack.at(-1);
    if (currentActionState === undefined) {
      this.beginDefaultAction();
      return;
    }
    if (currentActionState.runningGen) {
      const nextResult = currentActionState.runningGen.next(ms);
      if (nextResult.done) {
        this._endAction(currentActionState);
      }
      if (nextResult.value) {
        if (Array.isArray(nextResult.value)) {
          this._startAction(nextResult.value[0], nextResult.value[1]);
        } else {
          this._startAction(nextResult.value);
        }
      }
    } else {
      this._endAction(currentActionState);
    }
  }
  _startAction<AN extends ActionNamesType>(
    actionName: AN,
    arg?: ExtractActionTypeArg<EntityType, ActionNamesType, ActionsLibType[AN]>
  ) {
    const entity = this.entity;
    const actionDef = this.actions[actionName];
    const actionState: RunningAction<ActionNamesType, ActionNamesType> = {
      name: actionName
    };
    actionDef.init?.(entity, arg);
    actionDef.resume?.(entity, arg);
    if (actionDef.run) {
      actionState.runningGen = actionDef.run(entity, arg);
    }
    this.actionStack.push(actionState);
  }
  _endAction(actionState: RunningAction<ActionNamesType, unknown>) {
    const entity = this.entity;
    const actionDef = this.actions[actionState.name];
    actionDef.done?.(entity);
    if (actionState === this.actionStack.at(-1)) {
      this.actionStack.pop();
    } else {
      this.actionStack = this.actionStack.filter((a) => a !== actionState);
    }
    const nextActionState = this.actionStack.at(-1);
    const nextActionDef = this.actions[nextActionState?.name ?? ""];
    nextActionDef?.resume?.(entity);
    if (this.actionStack.length === 0) {
      this.beginDefaultAction();
    }
  }
}
