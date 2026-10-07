import { exposeErrorMessage } from "../core/Bindings";

export enum KnownErrorTypes {
  ManaOverdrawn = "ManaOverdrawn"
}

@exposeErrorMessage()
export class RuntimeManaOverdrawnError extends Error {
  public _isKnownError = true;
  public knownErrorType = KnownErrorTypes.ManaOverdrawn;
}

export type KnownError = RuntimeManaOverdrawnError;

export const isKnownError = (err: unknown): err is KnownError => {
  if (typeof err !== "object" || err === null) return false;
  return !!(err as KnownError)._isKnownError;
};

export const serializeKnownError = (
  err: KnownError
): {
  msg: string;
  __isKnownError: true;
} => {
  return {
    msg: err.message,
    __isKnownError: true
  };
};

export type KnownErrorSerialized = ReturnType<typeof serializeKnownError>;

export const deserializeKnownError = (
  err: KnownErrorSerialized
): KnownError => {
  return new RuntimeManaOverdrawnError(err.msg);
};

export const knownErrorFromMsgAndType = (
  msg: string,
  _type: KnownErrorTypes
) => {
  return new RuntimeManaOverdrawnError(msg);
};
