import { IVector2 } from "src/engine/util/vecTypes";

export type SpellIconSpec = {
  layers: SpellIconSpecLayer[];
  backgroundColor?: number;
};

export type SpellIconSpecLayer = {
  iconKey: string;
  position: IVector2;
  scale: number;
  rotation: number;
  color: number;
};