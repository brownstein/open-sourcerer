import { BaseEntityType } from "src/api/entity";

/**
 * Maps network ids to entities. Local entity ids are random (`shortid()`) and
 * differ per client, so replicated entities travel under a netId of the form
 * `<ownerPeerId>:<counter>`, which is unique across the mesh without any
 * coordination.
 */
export class NetIdRegistry {
  private readonly ownPeerId: string;
  private counter = 0;
  /** netId -> locally-owned real entity. */
  private owned = new Map<string, BaseEntityType>();
  private ownedByEntityId = new Map<string, string>();
  /** netId -> local stub entity mirroring a remote peer's entity. */
  private stubs = new Map<string, BaseEntityType>();

  constructor(ownPeerId: string) {
    this.ownPeerId = ownPeerId;
  }

  allocate(entity: BaseEntityType): string {
    const existing = this.ownedByEntityId.get(entity.id);
    if (existing) return existing;
    const netId = `${this.ownPeerId}:${this.counter++}`;
    this.owned.set(netId, entity);
    this.ownedByEntityId.set(entity.id, netId);
    return netId;
  }

  getOwnedNetId(entityId: string): string | undefined {
    return this.ownedByEntityId.get(entityId);
  }

  getOwned(netId: string): BaseEntityType | undefined {
    return this.owned.get(netId);
  }

  getOwnedEntries(): [string, BaseEntityType][] {
    return [...this.owned.entries()];
  }

  releaseOwned(entityId: string): string | undefined {
    const netId = this.ownedByEntityId.get(entityId);
    if (netId === undefined) return undefined;
    this.ownedByEntityId.delete(entityId);
    this.owned.delete(netId);
    return netId;
  }

  registerStub(netId: string, stub: BaseEntityType): void {
    this.stubs.set(netId, stub);
  }

  getStub(netId: string): BaseEntityType | undefined {
    return this.stubs.get(netId);
  }

  releaseStub(netId: string): BaseEntityType | undefined {
    const stub = this.stubs.get(netId);
    this.stubs.delete(netId);
    return stub;
  }

  getStubEntries(): [string, BaseEntityType][] {
    return [...this.stubs.entries()];
  }

  static ownerOf(netId: string): string {
    return netId.slice(0, netId.lastIndexOf(":"));
  }

  clear(): void {
    this.counter = 0;
    this.owned.clear();
    this.ownedByEntityId.clear();
    this.stubs.clear();
  }
}
