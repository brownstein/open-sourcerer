import { Vector2 } from "three";

// The "Solid" API allows character physics behavior entities to treat something as solid.

export type SolidEntityAPI = {
  solidTerrainLike: true;
  solidPlatformLike?: boolean;
};

export function isSolidTerrainLike(entity: object): entity is SolidEntityAPI {
  const asSolidEntityAPI = entity as SolidEntityAPI;
  return !!asSolidEntityAPI.solidTerrainLike;
}

// The "Bouncy" API allows entities to bounce entities up when landing on them.

export type BouncyEntityAPI = {
  bouncy: true;
  bounceVector?: Vector2;
  bounceStrengthOffset?: number;
  bounceStrengthMultiplier?: number;
};

export function isBouncy(entity: object): entity is BouncyEntityAPI {
  const asBouncy = entity as BouncyEntityAPI;
  return !!asBouncy.bouncy;
}

// The "Bouncable" API allows entities to receive bounce callbacks.

export type BouncableEntityAPI = {
  doBounce: () => void;
};

export function isBouncable(entity: object): entity is BouncableEntityAPI {
  const asBouncable = entity as BouncableEntityAPI;
  return !!asBouncable.doBounce;
}
