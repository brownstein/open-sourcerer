// A group of foreground terrain entities that have been linked together because
// they are spatially adjacent. The player can only ever be "behind" the
// individual terrain entity it physically overlaps, but a contiguous foreground
// structure is usually split into several separate terrain entities by the map
// merge step. Without linking, walking from one sub-section into the next makes
// the section you just left snap back to full opacity while the next section
// fades out — a visible flicker.
//
// A ForegroundFadeGroup fixes that by reference counting: every member that the
// player is currently behind contributes one reference, and the whole group
// fades as a single unit whenever the reference count crosses zero. The group
// is faded while at least one member is occluded and only fades back in once the
// player has left every member of the group.

// Anything that can participate in a fade group. BaseTerrain implements this.
export interface ForegroundFadeMember {
  // Drive this member's own fade animation toward the given state.
  applyForegroundFade(faded: boolean): void;
}

export class ForegroundFadeGroup {
  // Every terrain entity linked into this group.
  private readonly members = new Set<ForegroundFadeMember>();
  // The subset of members the player is currently behind (the reference set).
  private readonly activeMembers = new Set<ForegroundFadeMember>();

  add(member: ForegroundFadeMember): this {
    this.members.add(member);
    return this;
  }

  remove(member: ForegroundFadeMember) {
    this.members.delete(member);
    const wasActive = this.activeMembers.delete(member);
    // If the member we removed was the last reference, the rest of the group is
    // no longer occluded — fade it back in.
    if (wasActive && this.activeMembers.size === 0) this.applyToAll(false);
  }

  // Number of distinct members currently keeping the group faded.
  get refCount() {
    return this.activeMembers.size;
  }

  get faded() {
    return this.activeMembers.size > 0;
  }

  // Mark a single member as occluded (faded=true) or no longer occluded
  // (faded=false). The entire group fades together based on the aggregate
  // reference count, so individual members never fade independently.
  setMemberFaded(member: ForegroundFadeMember, faded: boolean) {
    if (!this.members.has(member)) this.members.add(member);
    const wasFaded = this.faded;
    if (faded) this.activeMembers.add(member);
    else this.activeMembers.delete(member);
    // Only animate when the group's aggregate state actually flips.
    if (this.faded !== wasFaded) this.applyToAll(this.faded);
  }

  private applyToAll(faded: boolean) {
    for (const member of this.members) member.applyForegroundFade(faded);
  }
}
