import { CodingChallengeProviderAPI } from "src/api/codingChallenge";
import { LevelAPI } from "src/api/entity";
import { TypedEventEmitter } from "src/api/util";
import { SpellRuntimeAPI } from "src/scripting/runtime/SpellRuntimeAPI";

export enum GameControllerEvents {
  RenderStart = "RenderStart",
  CameraSizing = "CameraSizing",
  RenderFrame = "RenderFrame",
  LoadLevelStart = "LoadLevelStart",
  LoadLevelProgress = "LoadLevelProgress",
  LoadLevelComplete = "LoadLevelComplete",
  TransitionToLevelStart = "TransitionToLevelStart",
  TransitionToLevelComplete = "TransitionToLevelComplete"
}

export type GameControllerEventTypes = {
  [GameControllerEvents.RenderStart]: void;
  [GameControllerEvents.CameraSizing]: void;
  [GameControllerEvents.RenderFrame]: number;
  [GameControllerEvents.LoadLevelStart]: void;
  [GameControllerEvents.LoadLevelProgress]: number;
  [GameControllerEvents.LoadLevelComplete]: void;
  [GameControllerEvents.TransitionToLevelStart]: void;
  [GameControllerEvents.TransitionToLevelComplete]: void;
};

export type GameControllerAPI = {
  readonly events: TypedEventEmitter<GameControllerEventTypes>;
  readonly level?: LevelAPI;
  readonly spellRuntime?: SpellRuntimeAPI;
  readonly codingChallenges?: CodingChallengeProviderAPI;
};
