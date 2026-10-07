export class CollisionHandleTracker {
  private collisions = new Map<string, Set<number>>();
  add(entityId: string, colliderHandle: number) {
    if (!this.collisions.has(entityId)) this.collisions.set(entityId, new Set());
    this.collisions.get(entityId)?.add(colliderHandle);
  }
  delete(entityId: string, colliderHandle: number) {
    const entityCols = this.collisions.get(entityId);
    if (!entityCols) {
      return;
    }
    entityCols.delete(colliderHandle);
    if (entityCols.size === 0) this.collisions.delete(entityId);
  }
  deleteAll(entityId: string) {
    this.collisions.delete(entityId);
  }
  any() {
    return this.collisions.size > 0;
  }
}