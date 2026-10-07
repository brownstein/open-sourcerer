import { Vector2, Vector3 } from "three";

import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { ElementalType } from "./entity";
import { ColorRepresentation, TypedEventEmitter } from "./util";

export type CastProgressEventTypes = {
  abort: void;
  aimUpdateVector: Vector2;
  aimTrigger: void;
};

export type DoCastDeferredEmitter = DeferredEmitter<
  {
    done: void;
    cancel: string;
    manaOverdrawn: void;
  },
  "done",
  "cancel" | "manaOverdrawn"
>;

export const createCastDeferredEmitter = () =>
  new DeferredEmitter<
    {
      done: void;
      cancel: string;
      manaOverdrawn: void;
    },
    "done",
    "cancel" | "manaOverdrawn"
  >(["done"], ["cancel", "manaOverdrawn"]);

export type CasterEntityAPI = {
  hasCastInProgress: () => boolean;
  doCast: (castProps: CasterEntityCastProps) => DoCastDeferredEmitter;
  addMana: (mana: number) => boolean;
  subMana: (mana: number) => boolean;
  getCastOrigin: () => Vector3;
};

// This is a kludge, but you have to work to screw with it.
export function hasCasterEntityApi(api: unknown): api is CasterEntityAPI {
  if (!api) return false;
  const asCaster = api as CasterEntityAPI;
  return !!asCaster.doCast && !!asCaster.doCast && !!asCaster.getCastOrigin;
}

export type CasterEntityCastProps = {
  elementalType?: ElementalType;
  color?: ColorRepresentation;
  initialVector?: Vector2;
  speed?: number;
  hold?: boolean;
  skipWindupAnimation?: boolean;
  progressEvents?: TypedEventEmitter<CastProgressEventTypes>;
  manaCost?: number;
};
