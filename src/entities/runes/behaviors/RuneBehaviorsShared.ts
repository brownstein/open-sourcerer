import { BaseEntityType, EntityBehavior, LevelAPI } from "src/api/entity";
import { TypedEventEmitter } from "src/api/util";

export const runeConnectionFlag = "isRuneConnectable";
export const runeFlag = "isRune";

export type RuneConnectivityEntityAPI = BaseEntityType & {
  [runeConnectionFlag]: true;
  behaviors: {
    connectivity: RuneConnectivityBehaviorAPI;
  };
};

export const isRuneConnectionEntityAPI = (
  entity: BaseEntityType
): entity is RuneConnectivityEntityAPI => {
  return !!(entity as RuneConnectivityEntityAPI)[runeConnectionFlag];
};

export type RuneConnectivityEventTypes = {
  connected: RuneConnectivityEntityAPI;
  disconnected: RuneConnectivityEntityAPI;
  connectedBy: RuneConnectivityEntityAPI;
  disconnectedBy: RuneConnectivityEntityAPI;
};

export type RuneConnectivityBehaviorAPI =
  EntityBehavior<RuneConnectivityEntityAPI> & {
    events: TypedEventEmitter<RuneConnectivityEventTypes>;
    canConnect: boolean;
    connect(entity: RuneConnectivityEntityAPI): void;
    disconnect(entity: RuneConnectivityEntityAPI): void;
  };

export type RuneSequenceEventTypes = {
  sequenceChanged: void;
  sequenceRefresh: RuneSequenceAPI[];
  sequenceStartedRun: void;
  sequenceCompletedRun: [boolean, unknown];
};

export type RuneSequenceAPI = {
  events: TypedEventEmitter<RuneSequenceEventTypes>;
  members: RuneEntityAPI[];
  runResult?: unknown;
  add(members: RuneEntityAPI[]): void;
  remove(memberIds: string[]): void;
  has(memberId: string): boolean;
  getFirstMember(): RuneEntityAPI | undefined;
  getCodeValue(): string;
  invokeIfChanged(level: LevelAPI): void;
};

export type RuneSequenceBehaviorAPI = EntityBehavior<RuneEntityAPI> & {
  events: TypedEventEmitter<RuneSequenceEventTypes>;
  getSequence(): RuneSequenceAPI | undefined;
  enable(): void;
  disable(): void;
  attach(otherEntity: RuneEntityAPI): void;
  detach(otherEntity: RuneEntityAPI): void;
};

export type RuneValueEventTypes = {
  valueChanged: [boolean, unknown];
};

export type RuneValueBehaviorAPI = EntityBehavior & {
  events: TypedEventEmitter<RuneValueEventTypes>;
  getCodeValue(): string;
};

export function isRuneAPI(entity: BaseEntityType): entity is RuneEntityAPI {
  return !!(entity as RuneEntityAPI)[runeFlag];
}

export type RuneEntityAPI = BaseEntityType & {
  [runeFlag]: boolean;
  [runeConnectionFlag]: boolean;
  behaviors: {
    connectivity: RuneConnectivityBehaviorAPI;
    sequence: RuneSequenceBehaviorAPI;
    value: RuneValueBehaviorAPI;
  };
};

export function getRuneColor(
  isSet: boolean,
  isTruthy: boolean,
  isError?: boolean,
  isComputeInProgress?: boolean
) {
  if (isError) return 0x880000;
  if (isTruthy) return 0x00ff00;
  if (isSet) return 0x008800;
  if (isComputeInProgress) return 0x00aaff;
  return 0x444444;
}
