// Some level entities can accept code provided to them.
import { BaseEntityType } from "./entity";

// This is the standard interface to support that.
export type EntityCodeInjectionAPI = {
  acceptCode?: (code: string) => void;
  acceptPromptResult?: (result: string) => void;
};

export function entityAcceptsCode(
  entity: BaseEntityType
): entity is BaseEntityType &
  EntityCodeInjectionAPI &
  Required<Pick<EntityCodeInjectionAPI, "acceptCode">> {
  const asCodeInjectionAPI = entity as EntityCodeInjectionAPI;
  return !!asCodeInjectionAPI.acceptCode;
}

export function entityAcceptsPromptResult(
  entity: BaseEntityType
): entity is BaseEntityType &
  EntityCodeInjectionAPI &
  Required<Pick<EntityCodeInjectionAPI, "acceptPromptResult">> {
  const asPromptInjectionAPI = entity as EntityCodeInjectionAPI;
  return !!asPromptInjectionAPI.acceptPromptResult;
}
