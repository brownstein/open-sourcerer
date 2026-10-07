import { Object3D } from "three";
import { Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import { EntityNetSummary, MultiplayerStubAPI, isSaneSummary } from "../api";
import { DeadReckoner } from "../replication/DeadReckoner";

export type StubEntityProps = EntityProps & {
  /** Optional so stubs survive generic registry instantiation (dev entity
   *  spawner, allEntities harness, metadata scripts); the replicator always
   *  passes all three. Without them the stub is inert but valid. */
  netId?: string;
  ownerPeerId?: string;
  spawnSummary?: EntityNetSummary;
};

/**
 * Base class for multiplayer stubs: local presentation-only mirrors of an
 * entity that lives (and simulates) on another peer. A stub never runs the
 * real entity's logic — it dead-reckons the owner's reported motion and lets
 * subclasses map summary fields onto sprites, VFX, and local consequences.
 */
export class StubEntity extends CoreEntity implements MultiplayerStubAPI {
  static type = "MultiplayerStub";
  public type = StubEntity.type;
  public readonly isMultiplayerStub = true as const;
  public readonly netId: string;
  public readonly ownerPeerId: string;
  public object3D = new Object3D();
  public persist = false;

  protected readonly reckoner = new DeadReckoner();
  protected lastSummary: EntityNetSummary;
  protected readonly sampledPosition = new Vector2();
  protected readonly sampledVelocity = new Vector2();

  constructor(props: StubEntityProps) {
    super(props);
    this.netId = props.netId ?? "";
    this.ownerPeerId = props.ownerPeerId ?? "";
    this.lastSummary = props.spawnSummary ?? {
      pos: { x: this.position.x, y: this.position.y }
    };
    this.reckoner.applySummary(this.lastSummary, performance.now());
    this.object3D.position.copy(this.position);
  }

  applyNetSummary(summary: EntityNetSummary): void {
    if (!isSaneSummary(summary)) return;
    this.reckoner.applySummary(summary, performance.now());
    this.lastSummary = { ...this.lastSummary, ...summary };
    this.onSummary(this.lastSummary);
  }

  /** Subclass hook: react to merged summary fields (anim, facing, extras). */
  protected onSummary(_summary: EntityNetSummary): void {}

  handleNetEvent(_kind: string, _data: unknown): void {}

  /** Default: fall out of the level quietly. Subclasses play exits. */
  handleDespawn(_reason: string, finalSummary?: EntityNetSummary): void {
    if (finalSummary) this.applyNetSummary(finalSummary);
    this.level?.removeEntity(this.id);
    this.destroy();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);
    const now = performance.now();
    this.reckoner.sample(now, this.sampledPosition);
    this.reckoner.sampleVelocity(now, this.sampledVelocity);
    this.position.x = this.sampledPosition.x;
    this.position.y = this.sampledPosition.y;
    this.object3D.position.x = this.position.x;
    this.object3D.position.y = this.position.y;
  }
}
