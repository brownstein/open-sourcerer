import * as femaleTypes from "./wolf-female";
import * as maleTypes from "./wolf-male";

export type sprite_layers = maleTypes.sprite_layers | femaleTypes.sprite_layers;
export type sprite_animations =
  | maleTypes.sprite_animations
  | femaleTypes.sprite_animations;
