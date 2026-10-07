import { Vector2 } from "three";

import { HotKeys } from "./hotkeys";
import { TypedEventEmitter } from "./util";

export enum ControlEvents {
  Pause = "Pause",
  UnPause = "UnPause",
  SetActiveContext = "SetActiveContext",
  PreJump = "PreJump",
  JumpStart = "JumpStart",
  JumpRelease = "JumpRelease",
  FallThrough = "FallThrough",
  FallThroughEnd = "FallThroughEnd",
  MoveHorizontally = "MoveHorizontally",
  MoveVertically = "MoveVertically",
  Stop = "Stop",
  Attack = "Attack",
  Interact = "Interact",
  HotKey = "HotKey",
  Click = "Click",
  LeftMouseDown = "LeftMouseDown",
  LeftMouseUp = "LeftMouseUp",
  RightMouseDown = "RightMouseDown",
  RightMouseUp = "RightMouseUp",
  CycleHotKeyRow = "CycleHotKeyRow",
  FrameAdvance = "FrameAdvance",
  SecondaryAttack = "SecondaryAttack"
}

export type ControlEventTypes = {
  [ControlEvents.Pause]: void;
  [ControlEvents.UnPause]: void;
  [ControlEvents.SetActiveContext]: [string, boolean];
  [ControlEvents.PreJump]: void; // This is exclusively used for delayed jumps.
  [ControlEvents.JumpStart]: void;
  [ControlEvents.JumpRelease]: void;
  [ControlEvents.FallThrough]: void;
  [ControlEvents.FallThroughEnd]: void;
  [ControlEvents.MoveHorizontally]: number;
  [ControlEvents.MoveVertically]: number;
  [ControlEvents.Stop]: void;
  [ControlEvents.Attack]: void;
  [ControlEvents.Interact]: void;
  [ControlEvents.HotKey]: HotKeys;
  [ControlEvents.Click]: void;
  [ControlEvents.LeftMouseDown]: void;
  [ControlEvents.LeftMouseUp]: void;
  [ControlEvents.RightMouseDown]: void;
  [ControlEvents.RightMouseUp]: void;
  [ControlEvents.CycleHotKeyRow]: void;
  [ControlEvents.FrameAdvance]: void;
  [ControlEvents.SecondaryAttack]: void;
};

export type ControlEventEmitter = TypedEventEmitter<ControlEventTypes>;

export type ControlsAPI<EntityType> = {
  events: ControlEventEmitter;
  cursorActive?: boolean;
  cursorScreenPosition?: Vector2;
  cursorScenePosition?: Vector2;
  cursorEntity?: EntityType;
  setCursorScreenPosition(position: Vector2): void;
  setCursorScenePosition(position: Vector2): void;
  setCursorEntity(entity?: EntityType): void;
  getCurrentHorizontalMotion(): number;
};
