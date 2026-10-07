import { RegistryProvider } from "src/api/registry";

import { EntityInfoExtensionClazz } from "./EntityBindingDefinitionAPI";
import { EarthBlock } from "./definitions/EarthBlock";
import { EncryptedWallTextInfo } from "./definitions/EncryptedWallText";
import { Fireball } from "./definitions/Fireball";
import { IceBlock } from "./definitions/IceBlock";
import { ManaSpark } from "./definitions/ManaSpark";
import { MovingTerrain } from "./definitions/MovingTerrain";
import { PistonInfo } from "./definitions/Piston";
import { PlayerInfo } from "./definitions/Player";
import { Projectile } from "./definitions/Projectile";
import { Sensor } from "./definitions/Sensor";
import { TechDoorInfo } from "./definitions/TechDoor";

const allBindings: EntityInfoExtensionClazz[] = [
  TechDoorInfo,
  EncryptedWallTextInfo,
  PistonInfo,
  PlayerInfo,
  ManaSpark,
  Fireball,
  Projectile,
  IceBlock,
  EarthBlock,
  Sensor,
  MovingTerrain
];

class EntityBindingDefinitionRegistry
  implements RegistryProvider<EntityInfoExtensionClazz>
{
  private backing = new Map<string, EntityInfoExtensionClazz>();

  constructor(allClazzes: EntityInfoExtensionClazz[]) {
    for (const clazz of allClazzes) {
      this.add(clazz.type, clazz);
    }
  }
  keys() {
    return [...this.backing.keys()];
  }
  add(key: string, clazz: EntityInfoExtensionClazz) {
    this.backing.set(key, clazz);
  }
  get(key: string) {
    return this.backing.get(key) ?? null;
  }
}

export const entityBindingDefinitions = new EntityBindingDefinitionRegistry(
  allBindings
);
