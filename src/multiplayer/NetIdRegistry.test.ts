import { BaseEntityType } from "src/api/entity";

import { NetIdRegistry } from "./NetIdRegistry";
import { isSaneSummary } from "./api";

function fakeEntity(id: string): BaseEntityType {
  return { id } as unknown as BaseEntityType;
}

describe("NetIdRegistry", () => {
  it("allocates stable ids per entity, scoped to the own peer", () => {
    const registry = new NetIdRegistry("peerA");
    const entity = fakeEntity("e1");
    const netId = registry.allocate(entity);
    expect(netId).toBe("peerA:0");
    expect(registry.allocate(entity)).toBe(netId);
    expect(registry.allocate(fakeEntity("e2"))).toBe("peerA:1");
    expect(registry.getOwned(netId)).toBe(entity);
    expect(registry.getOwnedNetId("e1")).toBe(netId);
  });

  it("extracts the owner peer from a netId (peer ids may contain colons)", () => {
    expect(NetIdRegistry.ownerOf("peerA:3")).toBe("peerA");
    expect(NetIdRegistry.ownerOf("we:ird:7")).toBe("we:ird");
  });

  it("releases owned entities", () => {
    const registry = new NetIdRegistry("peerA");
    const entity = fakeEntity("e1");
    const netId = registry.allocate(entity);
    expect(registry.releaseOwned("e1")).toBe(netId);
    expect(registry.getOwned(netId)).toBeUndefined();
    expect(registry.getOwnedNetId("e1")).toBeUndefined();
  });

  it("tracks stubs separately from owned entities", () => {
    const registry = new NetIdRegistry("peerA");
    const stub = fakeEntity("s1");
    registry.registerStub("peerB:0", stub);
    expect(registry.getStub("peerB:0")).toBe(stub);
    expect(registry.getOwned("peerB:0")).toBeUndefined();
    expect(registry.releaseStub("peerB:0")).toBe(stub);
    expect(registry.getStub("peerB:0")).toBeUndefined();
  });
});

describe("isSaneSummary", () => {
  it("accepts finite summaries", () => {
    expect(isSaneSummary({ pos: { x: 1, y: 2 } })).toBe(true);
    expect(
      isSaneSummary({
        pos: { x: 0, y: 0 },
        vel: { x: -3, y: 4 },
        acc: { x: 0, y: -9.8 }
      })
    ).toBe(true);
  });

  it("rejects non-finite motion values", () => {
    expect(isSaneSummary({ pos: { x: NaN, y: 0 } })).toBe(false);
    expect(isSaneSummary({ pos: { x: 0, y: Infinity } })).toBe(false);
    expect(
      isSaneSummary({ pos: { x: 0, y: 0 }, vel: { x: NaN, y: 0 } })
    ).toBe(false);
    expect(
      isSaneSummary({ pos: { x: 0, y: 0 }, acc: { x: 0, y: NaN } })
    ).toBe(false);
    // JSON serialization turns NaN into null — reject that shape too.
    expect(
      isSaneSummary({
        pos: { x: null as unknown as number, y: 0 }
      })
    ).toBe(false);
  });
});
