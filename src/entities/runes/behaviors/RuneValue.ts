import { BaseEntityType } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";

import {
  RuneValueBehaviorAPI,
  RuneValueEventTypes
} from "./RuneBehaviorsShared";

export function hasValueBehavior(
  entity: BaseEntityType
): entity is BaseEntityType<{
  value: RuneValueBehavior;
}> {
  return (
    entity &&
    entity.behaviors &&
    (
      entity as BaseEntityType<{
        value: RuneValueBehavior;
      }>
    ).behaviors.value instanceof RuneValueBehavior
  );
}

export class RuneValueBehavior implements RuneValueBehaviorAPI {
  public type = "RuneValueBehavior";
  public events = createTypedEventEmitter<RuneValueEventTypes>();
  public value?: unknown;
  public isCodeValue = false;
  public error?: string;
  setValue(
    value: unknown,
    isError: boolean = false,
    isCodeValue: boolean = false
  ) {
    const valueChanging = this.value !== value;
    this.error = isError ? `${value}` : undefined;
    this.value = isError ? undefined : value;
    this.isCodeValue = isCodeValue;
    if (valueChanging) this.events.emit("valueChanged", [!isError, value]);
    return this;
  }
  getRawValue() {
    return this.value;
  }
  getCodeValue() {
    if (this.isCodeValue && typeof this.value === "string") return this.value;
    return JSON.stringify(this.value);
  }
}
