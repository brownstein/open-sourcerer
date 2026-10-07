import { Vector2 } from "three";

import { BaseEntityType, EntityBehavior } from "./entity";
import { TypedEventEmitter } from "./util";

/**
 * Types for valid data to be relayed between entities within the level.
 */

export type SignalDataPrimitive = boolean | number | string | null | undefined;
export type SignalData =
  | SignalDataPrimitive
  | SignalData[]
  | { [key: string]: SignalData };

export function isSignalDataPrimitive(data: unknown): boolean {
  switch (typeof data) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return true;
    case "object":
      if (data === null) return true;
      return false;
    default:
      return false;
  }
}

export function signalDataSize(data: unknown, limit = 2 ** 10): number {
  let size = 0;
  switch (typeof data) {
    case "boolean":
    case "number":
    case "undefined":
      size = 4;
      break;
    case "string":
      size = data.length;
      break;
    case "object":
      if (data === null) {
        size = 4;
        break;
      }
      if (Array.isArray(data)) {
        size = 4;
        for (const arrData of data) {
          const arrDataSize = signalDataSize(arrData, limit - size);
          if (arrDataSize < 0) return arrDataSize;
          size += arrDataSize;
          if (size > limit) return -1;
        }
        break;
      }
      for (const [k, v] of Object.entries(data)) {
        if (typeof k !== "string") return -1;
        size += k.length;
        const objDataSize = signalDataSize(v, limit - size);
        if (objDataSize < 0) return objDataSize;
        size += objDataSize;
        if (size > limit) return -1;
      }
      break;
    default:
      return -2;
  }
  if (size > limit) return -1;
  return size;
}

export class DataTypeValidationError extends Error {
  public _isDataTypeValidationError = true;
}

export class DataSizeValidationError extends Error {
  public _isDataSizeValidationError = true;
}

export function isDataTypeValidationError(
  err: unknown
): err is DataTypeValidationError {
  if (err instanceof DataTypeValidationError) return true;
  return false;
}

export function isDataSizeValidationError(
  err: unknown
): err is DataSizeValidationError {
  if (err instanceof DataSizeValidationError) return true;
  return false;
}

export function validateSignalData(data: unknown): data is SignalData {
  const dataSize = signalDataSize(data);
  if (dataSize === -2)
    throw new DataTypeValidationError("Data does not match exepcted type.");
  if (dataSize === -1)
    throw new DataTypeValidationError("Data is too large to use for IO.");
  return true;
}

/**
 * The payload relayed between entities. `value` carries the meaningful state
 * (e.g. on/off, a numeric level); `name` lets a signal label itself so
 * consumers can route by it; `sourceId` is the id of the entity that
 * originated the signal, used for loop dedupe.
 */
export type Signal = {
  value: SignalData;
  name?: string;
  sourceId?: string;
  /**
   * Junctions that have already relayed this pulse. Carried with the pulse so
   * it crosses each junction at most once and cycles terminate.
   */
  visited?: Set<SignalConnectionAPI>;
};

/**
 * Physical propagation state of a bus. A signal travels along the bus's 1D
 * arc-length. `originDistance` is where it was injected; `spread` is how far
 * the front has travelled from origin in each direction (the two live fronts
 * sit at originDistance ± spread).
 */
export type SignalPropagation = {
  originDistance: number;
  spread: number;
};

export type NearestPoint = {
  point: Vector2;
  distance: number;
  distanceAlong: number;
};

export type SignalBusEventTypes = {
  transmitted: { signal: Signal; originDistance: number };
};

export interface SignalBusAPI {
  readonly hasGeometry: boolean;
  getNearestPoint(worldPos: Vector2): NearestPoint;
  getTotalLength(): number;
  transmit(signal: Signal, source?: SignalConnectionAPI): void;
  /** Active timed propagations only. Instant buses report none. */
  getActivePropagations(): SignalPropagation[];
  /** Fired on every transmit so the game can animate even instant buses. */
  readonly events: Readonly<TypedEventEmitter<SignalBusEventTypes>>;
}

export enum SignalConnectionEvents {
  SignalReceived = "SignalReceived",
  Connected = "Connected",
  Disconnected = "Disconnected"
}

export type SignalReceivedPayload = {
  signal: Signal;
  /** The bus that delivered this signal — useful for proxies/junctions. */
  fromBus?: SignalBusAPI;
};

export type SignalConnectionEventTypes = {
  [SignalConnectionEvents.SignalReceived]: SignalReceivedPayload;
  [SignalConnectionEvents.Connected]: SignalBusAPI;
  [SignalConnectionEvents.Disconnected]: SignalBusAPI;
};

export interface SignalConnectionAPI {
  transmit(signal: Signal): boolean;
  receive(signal: Signal, fromBus?: SignalBusAPI): void;
  connectTo(bus: SignalBusAPI, point?: Vector2, distanceAlong?: number): void;
  disconnectFrom(bus: SignalBusAPI): void;
  readonly connected: boolean;
  readonly events: Readonly<TypedEventEmitter<SignalConnectionEventTypes>>;
}
