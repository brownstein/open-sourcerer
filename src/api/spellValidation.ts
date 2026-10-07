import { TFunction } from "i18next";

import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { EntityLevelAPI } from "./entity";
import { SpellCtx } from "./spells";

export type SpellValidatorCtx = {
  t: TFunction;
  spellCtx: SpellCtx;
  level?: EntityLevelAPI;
};

export type SpellValidatorTestResult = {
  name: string;
  inProgress?: boolean;
  success?: boolean;
};

export type SpellValidationProgressResult = {
  type: "progress";
  tests?: SpellValidatorTestResult[];
};

export type SpellValidationValidResult = {
  type: "valid";
  tests?: SpellValidatorTestResult[];
  finalResult?: unknown;
};

export type SpellValidationInvalidResult = {
  type: "invalid";
  tests?: SpellValidatorTestResult[];
  error?: string | unknown;
  aborted?: boolean;
};

export type SpellValidationFinalResult =
  | SpellValidationValidResult
  | SpellValidationInvalidResult;

export type SpellValidationAnyResult =
  | SpellValidationProgressResult
  | SpellValidationValidResult
  | SpellValidationInvalidResult;

export function spellValidationResultIsInProgress(
  result: SpellValidationAnyResult
): result is SpellValidationProgressResult {
  return result.type === "progress";
}

export function spellValidatorResultIsValid(
  result: SpellValidationAnyResult
): result is SpellValidationValidResult {
  return result.type === "valid";
}

export function spellValidatorResultIsInvalid(
  result: SpellValidationAnyResult
): result is SpellValidationInvalidResult {
  return result.type === "invalid";
}

export type SpellValidationDeferredEmitter = DeferredEmitter<
  {
    progress: SpellValidationProgressResult;
    done: SpellValidationFinalResult;
    failed: SpellValidationInvalidResult;
    error: SpellValidationInvalidResult;
    cancel: void;
  },
  "done" | "failed",
  "error" | "cancel"
>;

export function createSpellValidationDeferredEmitter() {
  return new DeferredEmitter<
    {
      progress: SpellValidationProgressResult;
      done: SpellValidationFinalResult;
      failed: SpellValidationInvalidResult;
      error: SpellValidationInvalidResult;
      cancel: void;
    },
    "done" | "failed",
    "error" | "cancel"
  >(["done", "failed"], ["error", "cancel"]);
}

export type SpellValidator = (
  ctx: SpellValidatorCtx
) => SpellValidationDeferredEmitter;

export function extractErrorMessageStringFromInvalidResult(
  _ctx: SpellValidatorCtx,
  result: SpellValidationInvalidResult
): string | undefined {
  if (result.error === undefined) {
    return undefined;
  }
  if (typeof result.error === "string") return result.error;
  if (result.error instanceof Error) result.error.message;
  return String(result.error);
}
