import { ColorRepresentation } from "three";

import { ElementalType } from "./entity";

export type EnemyProps = {
  health?: number;
  attack?: number;
  speed?: number;
  element?: ElementalType;
  color?: ColorRepresentation;
};
