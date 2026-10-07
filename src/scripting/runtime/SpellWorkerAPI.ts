import { ValueCompletion } from "src/api/spells";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { JSRunnerConsoleOutput, JSRunnerCtx } from "src/scripting/core/api";

import {
  SpellEntitySyncPseudoAPI,
  TrackingIdentifier,
  TrackingInfoMessage
} from "./SpellEntitySyncAPI";

export type MessageId = string;
export type RunnerId = string;
export type RPCRequestId = string;

export enum MessageToWorkerType {
  Init = "Init",
  CreateRunner = "CreateRunner",
  DestroyRunner = "DestroyRunner",
  ExecuteScript = "ExecuteScript",
  AppendCode = "AppendCode",
  SetVariable = "SetVariable",
  SetVariables = "SetVariables",
  GetVariables = "GetVariables",
  PauseExecution = "PauseExecution",
  UnPauseExecution = "UnPauseExecution",
  StepExecution = "StepExecution",
  Terminate = "Terminate",
  SetSpeed = "SetSpeed",
  ModuleCodeResolutionResponse = "ModuleCodeResolutionResponse",
  ModuleRPCResponse = "ModuleRPCResponse",
  ModuleRPC = "ModuleRPC",
  ModuleRPCHeadless = "ModuleRPCHeadless",
  ComputeAutocomplete = "ComputeAutocomplete",
  ComputeImports = "ComputeImports",
  SyncEntities = "SyncEntities",
  SynchedEntityMessage = "SynchedEntityMessage",
  SynchedEntityCallbackResponse = "SynchedEntityCallbackResponse"
}

export const MessageToWorkerSet = new Set<string>([
  MessageToWorkerType.Init,
  MessageToWorkerType.CreateRunner,
  MessageToWorkerType.DestroyRunner,
  MessageToWorkerType.ExecuteScript,
  MessageToWorkerType.AppendCode,
  MessageToWorkerType.SetVariable,
  MessageToWorkerType.SetVariables,
  MessageToWorkerType.GetVariables,
  MessageToWorkerType.PauseExecution,
  MessageToWorkerType.UnPauseExecution,
  MessageToWorkerType.StepExecution,
  MessageToWorkerType.Terminate,
  MessageToWorkerType.SetSpeed,
  MessageToWorkerType.ModuleCodeResolutionResponse,
  MessageToWorkerType.ModuleRPCResponse,
  MessageToWorkerType.ModuleRPC,
  MessageToWorkerType.ModuleRPCHeadless,
  MessageToWorkerType.ComputeAutocomplete,
  MessageToWorkerType.ComputeImports,
  MessageToWorkerType.SyncEntities,
  MessageToWorkerType.SynchedEntityMessage,
  MessageToWorkerType.SynchedEntityCallbackResponse
]);

export type InitMessage = {
  type: MessageToWorkerType.Init;
  id: MessageId;
};

export type MessageToWorkerBase = {
  id: MessageId;
  runnerId: RunnerId;
};

export type CreateRunnerMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.CreateRunner;
};

export type DestroyRunnerMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.DestroyRunner;
};

export type ExecuteScriptMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.ExecuteScript;
  code: string;
};

export type AppendCodeMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.AppendCode;
  code: string;
  logResult?: boolean;
  bindLastResultToVariable?: string;
};

export type SetVariableMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.SetVariable;
  var: string;
  value: unknown;
};

export type SetVariablesMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.SetVariables;
  pairs: [string, unknown][];
};

export type GetVariablesMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.GetVariables;
  vars: string[];
  allUserVars?: boolean;
};

export type PauseExecutionMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.PauseExecution;
};

export type UnPauseExecutionMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.UnPauseExecution;
};

export type StepExecutionMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.StepExecution;
};

export type TerminateMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.Terminate;
};

export type SetSpeedMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.SetSpeed;
  speed: number;
};

export type ModuleCodeResolutionResponseMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.ModuleCodeResolutionResponse;
  requestId: RPCRequestId;
  code: string | null;
};

export type ModuleRPCResponseMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.ModuleRPCResponse;
  requestId: RPCRequestId;
  data?: unknown;
  error?: string;
};

export type ModuleRPCMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.ModuleRPC;
  moduleName: string;
  data: unknown;
};

export type ModuleRPCHeadlessMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.ModuleRPCHeadless;
  moduleName: string;
  data: unknown;
};

export type ComputeAutocompleteMessage = {
  type: MessageToWorkerType.ComputeAutocomplete;
  id: MessageId;
  code: string;
  currentRow: number;
  currentCol: number;
};

export type ComputeImportsMessage = {
  type: MessageToWorkerType.ComputeImports;
  id: MessageId;
  code: string;
};

export type SyncEntitiesMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.SyncEntities;
  requestId?: RPCRequestId;
  updates: TrackingInfoMessage[];
};

export type SynchedEntityMessage = MessageToWorkerBase & {
  type: MessageToWorkerType.SynchedEntityMessage;
  entityTrackingId: TrackingIdentifier;
  method: string;
  args: unknown[];
};

export type SynchedEntityCallbackResponse = MessageToWorkerBase & {
  type: MessageToWorkerType.SynchedEntityCallbackResponse;
  requestId: RPCRequestId;
  result?: unknown;
  errorMessage?: string;
};

export type MessageToWorker =
  | InitMessage
  | CreateRunnerMessage
  | DestroyRunnerMessage
  | ExecuteScriptMessage
  | AppendCodeMessage
  | SetVariableMessage
  | SetVariablesMessage
  | GetVariablesMessage
  | PauseExecutionMessage
  | UnPauseExecutionMessage
  | StepExecutionMessage
  | TerminateMessage
  | SetSpeedMessage
  | ModuleCodeResolutionResponseMessage
  | ModuleRPCResponseMessage
  | ModuleRPCMessage
  | ModuleRPCHeadlessMessage
  | ComputeAutocompleteMessage
  | ComputeImportsMessage
  | SyncEntitiesMessage
  | SynchedEntityMessage
  | SynchedEntityCallbackResponse;

export function isMessageToWorker(msg: unknown): msg is MessageToWorker {
  if (typeof msg !== "object" || msg === null) return false;
  const typedMsg = msg as MessageToWorker;
  return MessageToWorkerSet.has(typedMsg.type);
}

export enum MessageFromWorkerType {
  Ack = "Ack",
  TranspileStarted = "TranspileStarted",
  TranspileFinished = "TranspileFinished",
  TranspileError = "TranspileError",
  ExecutionStarted = "ExecutionStarted",
  ExecutionProgress = "ExecutionProgress",
  ExecutionFinished = "ExecutionFinished",
  ExecutionError = "ExecutionError",
  VariablesResult = "VariablesResult",
  ConsoleOutput = "ConsoleOutput",
  ModuleCodeResolutionRequest = "ModuleCodeResolutionRequest",
  ModuleRPCRequest = "ModuleRPCRequest",
  ComputeAutocompleteResult = "ComputeAutocompleteResult",
  ComputeImportsResult = "ComputeImportsResult",
  RequestEntitySyncInfo = "RequestEntitySyncInfo",
  SynchedEntityCallback = "SynchedEntityCallback"
}

export const MessageFromWorkerSet = new Set<string>([
  MessageFromWorkerType.Ack,
  MessageFromWorkerType.TranspileStarted,
  MessageFromWorkerType.ExecutionFinished,
  MessageFromWorkerType.TranspileError,
  MessageFromWorkerType.ExecutionStarted,
  MessageFromWorkerType.ExecutionProgress,
  MessageFromWorkerType.ExecutionFinished,
  MessageFromWorkerType.ExecutionError,
  MessageFromWorkerType.VariablesResult,
  MessageFromWorkerType.ConsoleOutput,
  MessageFromWorkerType.ModuleCodeResolutionRequest,
  MessageFromWorkerType.ModuleRPCRequest,
  MessageFromWorkerType.ComputeAutocompleteResult,
  MessageFromWorkerType.ComputeImportsResult,
  MessageFromWorkerType.RequestEntitySyncInfo,
  MessageFromWorkerType.SynchedEntityCallback
]);

export type MessageFromWorkerBase = {
  runnerId: RunnerId;
};

export type AckMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.Ack;
  messageToWorkerId: MessageId;
};

export type TranspileStartedMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.TranspileStarted;
};

export type TranspileErrorMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.TranspileError;
  error: {
    message: string;
    line: number;
  };
};

export type TranspileFinishedMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.TranspileFinished;
};

export type ExecutionStartedMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ExecutionStarted;
};

export type ExecutionProgressMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ExecutionProgress;
  currentLine: number | null;
};

export type ExecutionFinishedMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ExecutionFinished;
  value?: unknown;
};

export type ExecutionErrorMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ExecutionError;
  error: {
    message: string;
    line: number;
  };
};

export type VariablesResultMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.VariablesResult;
  messageToWorkerId: MessageId;
  results: [string, unknown][];
};

export type ConsoleOutputMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ConsoleOutput;
  output: JSRunnerConsoleOutput;
};

export type ModuleCodeResolutionRequestMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ModuleCodeResolutionRequest;
  id: RPCRequestId;
  moduleName: string;
};

export type ModuleRPCRequestMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.ModuleRPCRequest;
  runnerId: RunnerId;
  moduleName: string;
  id: RPCRequestId;
  data?: unknown;
  expectsResponse?: boolean;
};

export type ComputeAutocompleteResultMessage = {
  type: MessageFromWorkerType.ComputeAutocompleteResult;
  requestId: string;
  results: ValueCompletion[];
};

export type ComputeImportsResultMessage = {
  type: MessageFromWorkerType.ComputeImportsResult;
  requestId: string;
  imports?: string[];
  failed?: boolean;
};

export type RequestEntitySyncInfoMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.RequestEntitySyncInfo;
  requestId: string;
  identifiers: TrackingIdentifier[];
};

export type SynchedEntityCallbackMessage = MessageFromWorkerBase & {
  type: MessageFromWorkerType.SynchedEntityCallback;
  requestId: string;
  entityTrackingId: TrackingIdentifier;
  method: string;
  args: unknown[];
  translateHandlesInArgs?: Record<string, string>;
};

export type MessageFromWorker =
  | AckMessage
  | TranspileStartedMessage
  | TranspileErrorMessage
  | TranspileFinishedMessage
  | ExecutionStartedMessage
  | ExecutionProgressMessage
  | ExecutionFinishedMessage
  | ExecutionErrorMessage
  | VariablesResultMessage
  | ConsoleOutputMessage
  | ModuleCodeResolutionRequestMessage
  | ModuleRPCRequestMessage
  | ComputeAutocompleteResultMessage
  | ComputeImportsResultMessage
  | RequestEntitySyncInfoMessage
  | SynchedEntityCallbackMessage;

export function isMessageFromWorker(msg: unknown): msg is MessageFromWorker {
  if (typeof msg !== "object" || msg === null) return false;
  const typedMsg = msg as MessageFromWorker;
  return MessageFromWorkerSet.has(typedMsg.type);
}

export type UnknownMessagePattern = {
  message: unknown;
};

export type MessageEmitter = TypedEventEmitter<UnknownMessagePattern>;

export const createMessageEmitter = () =>
  createTypedEventEmitter<UnknownMessagePattern>();
