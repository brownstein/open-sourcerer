export type CharacterColorizeLayer =
  | "fur"
  | "fur_2"
  | "hair"
  | "eyes"
  | "shirt"
  | "pants";

export type CharacterSpecies = "wolf";

export type CharacterGender = "male" | "female";

export type ColorAndOpacity = {
  color: string;
  opacity?: number;
};

/**
 * How the player's sprite is tinted. `White` overrides the sprite's fade so
 * every pixel renders as flat white (silhouette mode).
 */
export enum PlayerRenderMode {
  Normal = "NORMAL",
  White = "WHITE"
}

export type CharacterCustomization = {
  name?: string;
  colors?: Partial<Record<CharacterColorizeLayer, ColorAndOpacity>>;
  species?: CharacterSpecies;
  gender?: CharacterGender;
};
