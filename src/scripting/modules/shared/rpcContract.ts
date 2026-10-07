import { KnownErrorTypes, isKnownError, knownErrorFromMsgAndType } from "src/scripting/runtime/SpellErrors";

import { Clazz } from "../../core/typings";

// Helpers for high-level RPC definitions.
export type RPCCallback<Input extends unknown[] = any[], Output = unknown> =
  | ((...args: Input) => Output)
  | ((...args: Input) => PromiseLike<Output>);

export type RPCDefs<T> = {
  [K in keyof T as T[K] extends RPCCallback ? K : never]: T[K] extends (
    ...args: any[]
  ) => any
    ? RPCCallback<Parameters<T[K]>, ReturnType<T[K]>>
    : never;
};

export type RPCDefsPromised<T> = {
  [K in keyof T as T[K] extends RPCCallback ? K : never]: T[K] extends (
    ...args: any[]
  ) => any
    ? ReturnType<T[K]> extends PromiseLike<any>
      ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
      : (...args: Parameters<T[K]>) => PromiseLike<ReturnType<T[K]>>
    : never;
};

export type RPCDefsAwaited<T> = {
  [K in keyof T as T[K] extends RPCCallback ? K : never]: T[K] extends (
    ...args: any[]
  ) => any
    ? (...args: Parameters<T[K]>) => Awaited<ReturnType<T[K]>>
    : never;
};

export type GetPromisedRPCTypeSignaturesForClazz<T> = T extends undefined
  ? {}
  : RPCDefsPromised<{
      [K in keyof T as T[K] extends RPCCallback ? K : never]: T[K];
    }>;

export type BoundRPCReqFromProto = {
  method: string;
  data: unknown;
};

export type BoundRPCResFromNative = {
  success: boolean;
  data?: unknown;
  errorMessage?: string;
  knownErrorType?: KnownErrorTypes;
};

// Builds an RPC proxy from an explicit list of method names. This is the
// pseudo-side (web worker) counterpart that does not need the native class:
// the auto-binding build script bakes the method names in as string literals
// so the worker bundle never imports main-thread module implementations.
export function bindMethodNamesAsRPCs<RT>(
  doGenericRPC: (data: unknown) => Promise<unknown>,
  methodNames: readonly string[]
): RT {
  const rpcs: Partial<
    Record<string, (...args: unknown[]) => Promise<unknown>>
  > = {};
  for (const key of methodNames) {
    rpcs[key] = async (...args: unknown[]) => {
      const rpcReq: BoundRPCReqFromProto = {
        method: key,
        data: args
      };
      const rpcRes = (await doGenericRPC(rpcReq)) as BoundRPCResFromNative;
      if (rpcRes.success) {
        return rpcRes.data;
      } else {
        if (rpcRes.knownErrorType) {
          throw knownErrorFromMsgAndType(
            rpcRes.errorMessage ?? "Mana Overdrawn.",
            rpcRes.knownErrorType
          );
        }
        throw new Error(
          rpcRes.errorMessage ?? "An unknown RPC error occurred."
        );
      }
    };
  }
  return rpcs as unknown as RT;
}

// This is used by proxyMagic.
export function bindMethodsAsRPCs<
  T,
  RT = GetPromisedRPCTypeSignaturesForClazz<T>
>(
  doGenericRPC: (data: unknown) => Promise<unknown>,
  clazz: Clazz<T> | undefined
): RT {
  if (clazz === undefined) return {} as RT;
  const prototype = (clazz as Clazz<T>).prototype;
  const names: string[] = [];
  for (const keyRaw of Object.keys(
    Object.getOwnPropertyDescriptors(prototype)
  )) {
    if (typeof keyRaw !== "string") continue;
    if (typeof prototype[keyRaw as keyof T] !== "function") continue;
    names.push(keyRaw);
  }
  return bindMethodNamesAsRPCs<RT>(doGenericRPC, names);
}

// This is used by proxyMagic.
export function getAutomaticRPCHandler<T>(instance: T): RPCCallback {
  return async function _handleRPC(
    rpcReq: unknown
  ): Promise<BoundRPCResFromNative> {
    try {
      const { method, data } = rpcReq as BoundRPCReqFromProto;
      const methodFunction = (instance as Record<string, unknown>)[method];
      if (methodFunction === undefined)
        throw new Error(`Method "${method}" not found on RPC handler.`);
      if (typeof methodFunction !== "function")
        throw new Error(
          `Method "${method}" found on RPC handler, but it's not a method.`
        );
      const args = Array.isArray(data) ? data : [data];
      const resultData = await methodFunction.apply(instance, args);
      return {
        success: true,
        data: resultData
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          success: false,
          errorMessage: err.message,
          knownErrorType: isKnownError(err) ? err.knownErrorType : undefined
        };
      }
      if (typeof err === "string") {
        return {
          success: false,
          errorMessage: err
        };
      }
      console.warn("Unknown error encountered by RPC handler", err);
      return {
        success: false,
        errorMessage:
          "The forces of magic broke under the strain (unknown error)."
      };
    }
  };
}
