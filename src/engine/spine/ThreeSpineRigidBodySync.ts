import RAPIER, { World } from "@dimforge/rapier2d-compat";
import {
  Animation,
  Bone,
  Event,
  MixBlend,
  MixDirection,
  Skeleton,
  SkeletonData,
  Timeline
} from "@esotericsoftware/spine-core";

import { EntityLevelAPI } from "src/api/entity";

// UNFINISHED.
// TODO: finish or delete.
export class ThreeSpineRigidBodySync {
  private level: EntityLevelAPI;

  constructor(level: EntityLevelAPI) {
    this.level = level;
  }
  addRigidBody() {}
  dispose() {}
}
