export enum CollisionBit {
  Default,
  Terrain,
  Player,
  Enemies,
  EnemiesBackground,
  Items,
  Damage,
  Projectiles,
  Runes,
  RuneSensor,
  Inactive,
  InactiveEnemy,
  TerrainSensor,
  Sensor
}

// Helper to convert an enum to distinct 32 bit bitmasks.
// Don't feed it an enum with more than 30 entries!
function enumToBitmasks<T extends Record<string, unknown>>(
  enumObj: T
): Record<keyof T, number> {
  const bitmasks: Partial<Record<keyof T, number>> = {};
  let shift = 0;
  for (const key of Object.keys(enumObj)) {
    if (`${Number(key)}` === `${key}`) continue;
    if (shift >= 16) throw new Error("Bitmask shift >= 16");
    const mask = 0b1 << shift++;
    bitmasks[key as keyof T] = mask;
  }
  return bitmasks as Record<keyof T, number>;
}

export const collisionBitmasks = enumToBitmasks(CollisionBit);
export const CBM = collisionBitmasks;

// Helper to derive combined membership and filter bitmasks.
export function getGroup(membership: number, filter: number) {
  return (membership << 16) | filter;
}

export function checkCollisionGroupsMatch(a: number, b: number) {
  return (a >> 16) & (b & 0xffff) && (b >> 16) & (a & 0xffff);
}

export const terrainCollisionGroup = getGroup(
  CBM.Terrain,
  CBM.Default |
    CBM.Terrain |
    CBM.Player |
    CBM.Enemies |
    CBM.Items |
    CBM.Projectiles |
    CBM.Inactive |
    CBM.InactiveEnemy |
    CBM.TerrainSensor |
    CBM.Runes |
    CBM.Sensor |
    CBM.Damage
);

export const noClipCollisionGroup = getGroup(CBM.Player, 0);

export const playerCollisionGroup = getGroup(
  CBM.Player,
  CBM.Default |
    CBM.Terrain |
    CBM.Items |
    CBM.Enemies |
    CBM.Damage |
    CBM.Projectiles |
    CBM.Sensor
);

export const enemyCollisionGroup = getGroup(
  CBM.Enemies,
  CBM.Default |
    CBM.Terrain |
    CBM.Player |
    CBM.Damage |
    CBM.Projectiles |
    CBM.Sensor
);

export const enemyBackgroundCollisionGroup = getGroup(
  CBM.EnemiesBackground,
  CBM.Damage | CBM.Projectiles | CBM.Sensor
);

export const itemCollisionGroup = getGroup(
  CBM.Items,
  CBM.Default | CBM.Terrain | CBM.Player | CBM.Sensor
);

export const inactiveCollisionGroup = getGroup(
  CBM.Inactive,
  CBM.Terrain | CBM.Damage
);

export const inactiveEnemyCollisionGroup = getGroup(
  CBM.InactiveEnemy,
  CBM.Terrain | CBM.Damage | CBM.Projectiles
);

export const damageCollisionGroup = getGroup(
  CBM.Damage,
  CBM.Player |
    CBM.Enemies |
    CBM.Inactive |
    CBM.InactiveEnemy |
    CBM.EnemiesBackground |
    CBM.Terrain
);

export const projectilesCollisionGroup = getGroup(
  CBM.Projectiles,
  CBM.Terrain |
    CBM.Enemies |
    CBM.Player |
    CBM.InactiveEnemy |
    CBM.EnemiesBackground |
    CBM.Sensor
);

export const terrainSensorCollisionGroup = getGroup(
  CBM.TerrainSensor,
  CBM.Terrain
);

export const runesCollisionGroup = getGroup(CBM.Runes, CBM.Runes | CBM.Terrain);

export const runeSensorCollisionGroup = getGroup(
  CBM.RuneSensor,
  CBM.RuneSensor
);

export const sensorCollisionGroup = getGroup(
  CBM.Sensor,
  CBM.Default |
    CBM.Player |
    CBM.Terrain |
    CBM.Enemies |
    CBM.EnemiesBackground |
    CBM.Runes |
    CBM.Items |
    CBM.Projectiles
);
