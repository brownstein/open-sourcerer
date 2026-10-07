import { FireballExplosionStub } from "./FireballExplosionStub";
import { FireballStub } from "./FireballStub";
import { GenericProjectileStub } from "./GenericProjectileStub";
import { HadoukenStub } from "./HadoukenStub";
import { ManaSparkStub } from "./ManaSparkStub";
import { PlayerStub } from "./PlayerStub";
import { StubEntity } from "./StubEntity";

/**
 * Maps a real entity's type name (as reported in spawn messages) to the stub
 * class that mirrors it on remote peers. An entity type without an entry here
 * simply does not appear for other players — this is the explicit opt-in
 * surface for multiplayer support, grown one type at a time.
 *
 * Stub classes are also registered in `entityClassRegistry` (allEntities.ts)
 * so `constructEntityAfterPreload` can preload their sprite assets.
 */
export const stubClassByEntityType: Record<string, typeof StubEntity> = {
  Player: PlayerStub,
  Fireball: FireballStub,
  GenericProjectile: GenericProjectileStub,
  Hadouken: HadoukenStub,
  FireballExplosion: FireballExplosionStub,
  ManaSpark: ManaSparkStub
};
