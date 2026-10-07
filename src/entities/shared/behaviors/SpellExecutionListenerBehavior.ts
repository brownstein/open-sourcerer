import { EntityBehavior } from "src/api/entity";
import {
  SpellCtxEventTypes,
  SpellCtxEvents,
  SpellsAPI,
  SpellsAPIEventTypes,
  SpellsAPIEvents
} from "src/api/spells";

export class SpellExecutionListenerBehavior implements EntityBehavior {
  public type = "SpellExecutionListenerBehavior";

  private readonly onExecutionStartCallbacks: ((
    arg: SpellsAPIEventTypes[SpellsAPIEvents.runSpellStart]
  ) => boolean)[] = [];
  private readonly onExecutionEndCallbacks: ((
    arg: SpellsAPIEventTypes[SpellsAPIEvents.runSpellEnd]
  ) => void)[] = [];
  private readonly onConsoleLogCallbacks: ((
    arg: SpellCtxEventTypes[SpellCtxEvents.consoleLog]
  ) => void)[] = [];

  // NOTE: the return boolean of the callback determines whether this execution should be used
  // for ctx specific callbacks, like onConsoleLog
  onExecutionStart(cb: (typeof this.onExecutionStartCallbacks)[number]): this {
    this.onExecutionStartCallbacks.push(cb);
    return this;
  }

  onExecutionEnd(cb: (typeof this.onExecutionEndCallbacks)[number]): this {
    this.onExecutionEndCallbacks.push(cb);
    return this;
  }

  onConsoleLog(cb: (typeof this.onConsoleLogCallbacks)[number]): this {
    this.onConsoleLogCallbacks.push(cb);
    return this;
  }

  attachToSpellApi(spellAPI: SpellsAPI): void {
    spellAPI.events.on(
      SpellsAPIEvents.runSpellStart,
      this._onExecutionStartWrapper
    );
    spellAPI.events.on(
      SpellsAPIEvents.runSpellEnd,
      this._onExecutionEndWrapper
    );
  }

  detachFromSpellApi(spellAPI: SpellsAPI): void {
    spellAPI.events.off(
      SpellsAPIEvents.runSpellStart,
      this._onExecutionStartWrapper
    );
    spellAPI.events.off(
      SpellsAPIEvents.runSpellEnd,
      this._onExecutionEndWrapper
    );
  }

  private readonly _onExecutionStartWrapper = (
    arg: SpellsAPIEventTypes[SpellsAPIEvents.runSpellStart]
  ): void => {
    let shouldNotUseThisExecutionForCallbacks = false;

    this.onExecutionStartCallbacks.forEach((cb) => {
      const shouldUseThisExecutionForCallbacks = cb(arg);

      if (!shouldUseThisExecutionForCallbacks)
        shouldNotUseThisExecutionForCallbacks = true;
    });

    if (shouldNotUseThisExecutionForCallbacks) return;

    arg.events.on(SpellCtxEvents.consoleLog, this._onConsoleLogWrapper);
  };

  private readonly _onExecutionEndWrapper = (
    arg: SpellsAPIEventTypes[SpellsAPIEvents.runSpellEnd]
  ): void => {
    this.onExecutionEndCallbacks.forEach((cb) => cb(arg));

    arg.events.off(SpellCtxEvents.consoleLog, this._onConsoleLogWrapper);
  };

  private readonly _onConsoleLogWrapper = (
    arg: SpellCtxEventTypes[SpellCtxEvents.consoleLog]
  ): void => {
    this.onConsoleLogCallbacks.forEach((cb) => cb(arg));
  };
}
