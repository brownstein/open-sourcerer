import {
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { SpellCtx } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { EventsProxy } from "src/engine/util/eventsProxy";

import {
  RuneEntityAPI,
  RuneSequenceAPI,
  RuneSequenceBehaviorAPI,
  RuneSequenceEventTypes
} from "./RuneBehaviorsShared";

class RuneSequenceInternal implements RuneSequenceAPI {
  public events = createTypedEventEmitter<RuneSequenceEventTypes>();
  public members: RuneEntityAPI[] = [];
  public runSequenceValue?: string;
  public runningCtx?: SpellCtx;
  public runResult?: unknown;
  public runError?: string;
  private level?: LevelAPI;
  private scheduler = new Scheduler();
  constructor(members?: RuneEntityAPI[]) {
    if (members !== undefined) this.members = members;
  }
  add(members: RuneEntityAPI[]) {
    if (!members.length) return;
    const currentIds = new Set(this.members.map((m) => m.id));
    let added = false;
    for (const member of members) {
      if (currentIds.has(member.id)) continue;
      this.members.push(member);
      added = true;
    }
    if (!added) return;
    this.flushCompute();
    this.members.sort((a, b) => a.position.x - b.position.x);
    this.events.emit("sequenceChanged");
  }
  merge(other: RuneSequenceAPI) {
    const firstEntity = this.members.at(0);
    const otherFirstEntity = other.members.at(0);
    if (!firstEntity || !otherFirstEntity) return;
    if (firstEntity.position.x < otherFirstEntity.position.x) {
      this.add(other.members);
      other.events.emit("sequenceRefresh", [this]);
      if (other instanceof RuneSequenceInternal) other.destroy();
    } else {
      other.add(this.members);
      this.events.emit("sequenceRefresh", [other]);
      this.destroy();
    }
  }
  remove(memberIds: string[]) {
    if (!memberIds.length) return;
    this.flushCompute();

    const removeIdSet = new Set(memberIds);
    const seqs: RuneSequenceInternal[] = [this];
    let currentSeq: RuneSequenceInternal = this;
    let currentSeqMembers: RuneEntityAPI[] = [];
    for (const member of this.members) {
      if (!removeIdSet.has(member.id)) {
        currentSeqMembers.push(member);
        continue;
      }
      if (currentSeqMembers.length) {
        currentSeq.members = currentSeqMembers;
        currentSeqMembers = [];
        currentSeq = new RuneSequenceInternal();
        seqs.push(currentSeq);
      }
    }
    currentSeq.members = currentSeqMembers;
    if (currentSeq === this) {
      this.events.emit("sequenceChanged");
    } else {
      this.events.emit(
        "sequenceRefresh",
        seqs.filter((seq) => !!seq.members.length)
      );
    }
  }
  split(member: RuneEntityAPI, nextMember: RuneEntityAPI) {
    this.flushCompute();
    const memberIndex = this.members.indexOf(member);
    const nextMemberIndex = this.members.indexOf(nextMember);
    if (memberIndex === -1 || nextMemberIndex === -1) return;
    const splitIndex =
      memberIndex < nextMemberIndex ? memberIndex + 1 : nextMemberIndex + 1;
    const seqA = new RuneSequenceInternal(this.members.slice(0, splitIndex));
    const seqB = new RuneSequenceInternal(this.members.slice(splitIndex));
    this.events.emit("sequenceRefresh", [seqA, seqB]);
  }
  has(memberId: string) {
    return this.members.some((m) => m.id === memberId);
  }
  destroy() {
    this.runningCtx?.destroy();
    this.runningCtx = undefined;
  }
  getFirstMember() {
    return this.members.at(0);
  }
  getCodeValue() {
    let code = this.members
      .map((m) => m.behaviors.value.getCodeValue())
      .join("");
    if (!code.endsWith(";")) code = `${code};`;
    return code;
  }
  private flushCompute() {
    this.runSequenceValue = "";
    this.runError = undefined;
    this.runningCtx?.destroy();
    this.runningCtx = undefined;
  }
  invokeIfChanged(level: LevelAPI) {
    this.level = level;
    const code = this.getCodeValue();
    if (code === this.runSequenceValue) return;
    this.runSequenceValue = code;
    if (this.runningCtx) this.runningCtx.destroy();
    this.runningCtx = undefined;
    this.events.emit("sequenceStartedRun");
    this.scheduler.cancel("invokeWithDelay");
    this.scheduler.add({
      id: "invokeWithDelay",
      duration: 100,
      invokeFunctionAtComplete: () => this.invokeSequenceInternal(code)
    });
  }
  private async invokeSequenceInternal(code: string) {
    try {
      const level = this.level;
      if (!level?.ctx?.spells) {
        this.events.emit("sequenceCompletedRun", [false, undefined]);
        return;
      }
      const ctx = await level.ctx.spells.run(code);
      if (code !== this.runSequenceValue) {
        ctx.destroy();
        return;
      }
      this.runError = undefined;
      this.runResult = undefined;
      this.runningCtx = ctx;
      const evaluatedValue = await ctx.runCompletePromise();
      this.runningCtx = undefined;
      ctx.destroy();
      if (this.runSequenceValue !== code) {
        return;
      }
      this.runError = ctx.error?.message;
      this.runResult = evaluatedValue;
      if (ctx.error) {
        this.events.emit("sequenceCompletedRun", [false, ctx.error]);
        return;
      }
      this.events.emit("sequenceCompletedRun", [true, evaluatedValue]);
    } catch (err) {
      console.warn("Rune sequence failed to run", err);
    }
  }
  step(ms: number) {
    this.scheduler.step(ms);
  }
}

const _kEval = "eval";
const _kEvalDelay = 200;
const kSequenceProxyEvents: (keyof RuneSequenceEventTypes)[] = [
  "sequenceChanged",
  "sequenceRefresh",
  "sequenceCompletedRun",
  "sequenceStartedRun"
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isRuneSequenceBehavior(
  behavior: RuneSequenceBehaviorAPI
): behavior is RuneSequenceBehavior {
  return (behavior as RuneSequenceBehavior).type === RuneSequenceBehavior.type;
}

export class RuneSequenceBehavior
  implements EntityBehavior<RuneEntityAPI>, RuneSequenceBehaviorAPI
{
  static type = "RuneSequenceBehavior";
  public type = "RuneSequenceBehavior";
  public events = new EventsProxy<RuneSequenceEventTypes>();
  public autoInvoke = true;

  private level?: LevelAPI;
  private entity?: RuneEntityAPI;
  private scheduler = new Scheduler();
  private sequence?: RuneSequenceInternal;

  constructor() {
    this.step = this.step.bind(this);
    this.doAutoInvoke = this.doAutoInvoke.bind(this);
  }
  init(entity: RuneEntityAPI, enabled: boolean = true) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    if (enabled) {
      this.sequence = new RuneSequenceInternal([this.entity]);
      this.events.subscribe(this.sequence.events, kSequenceProxyEvents);
    }
    this.events.on("sequenceRefresh", (newSequences) => {
      const currSequence = this.sequence;
      const nextSequence = newSequences.find(
        (seq) =>
          seq instanceof RuneSequenceInternal && seq.has(this.entity?.id ?? "")
      ) as RuneSequenceInternal | undefined;
      if (currSequence !== nextSequence) {
        if (currSequence) this.events.unsubscribe(currSequence.events);
        if (nextSequence)
          this.events.subscribe(nextSequence.events, kSequenceProxyEvents);
        if (!nextSequence) console.warn("No next sequence provided...");
      }
      this.sequence = nextSequence;
    });
    this.scheduler.add({
      id: "autoInvoke",
      duration: 250,
      recurring: true,
      invokeFunctionAtComplete: this.doAutoInvoke
    });
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
  }
  detachFromLevel() {
    this.level = undefined;
  }
  step(ms: number) {
    this.scheduler.step(ms);
    if (this.sequence?.getFirstMember() === this.entity)
      this.sequence?.step(ms);
  }
  getMemberIds(): string[] {
    if (!this.sequence) return [];
    return this.sequence.members.map((m) => m.id);
  }
  getSequence() {
    return this.sequence;
  }
  enable() {
    if (!this.sequence && this.entity) {
      this.sequence = new RuneSequenceInternal([this.entity]);
      this.events.subscribe(this.sequence.events, kSequenceProxyEvents);
    }
    return this;
  }
  disable() {
    if (this.sequence) {
      this.events.unsubscribe(this.sequence.events);
      if (this.entity) this.sequence.remove([this.entity.id]);
    }
    this.sequence = undefined;
    return this;
  }
  attach(otherEntity: RuneEntityAPI) {
    if (!this.sequence || !this.entity) return;
    if (this.sequence.has(otherEntity.id)) return;
    const otherSequence = otherEntity.behaviors.sequence.getSequence();
    if (otherSequence && !otherSequence.has(this.entity.id))
      this.sequence.merge(otherSequence);
    return this;
  }
  detach(otherEntity: RuneEntityAPI) {
    if (!this.sequence || !this.entity) return;
    this.sequence?.split(this.entity, otherEntity);
    return this;
  }
  private doAutoInvoke() {
    if (this.level && this.sequence?.getFirstMember() === this.entity)
      this.sequence?.invokeIfChanged(this.level);
  }
}
