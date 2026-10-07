import {
  normalizeEntityRefsAfterLoad,
  remapPastedEntityRefs,
  resolveEntityRef,
  toRuntimeEntityRefProperties
} from "./entityRefs";
import { EditorLayer, EntityPlacement } from "./levelEditorState";

// IOLinkNode declares `target` as a TiledObjectRef in the shipped metadata.
function linkNode(
  id: string,
  target: unknown,
  tiledObjectId?: number
): EntityPlacement {
  return {
    type: "IOLinkNode",
    tileX: 0,
    tileY: 0,
    id,
    ...(tiledObjectId !== undefined ? { tiledObjectId } : {}),
    properties: { target }
  };
}

function slime(id: string, tiledObjectId?: number): EntityPlacement {
  return {
    type: "Slime",
    tileX: 1,
    tileY: 1,
    id,
    ...(tiledObjectId !== undefined ? { tiledObjectId } : {})
  };
}

function layersWith(entities: EntityPlacement[]): EditorLayer[] {
  return [
    { kind: "entity", id: "e1", name: "Entities", visible: true, entities }
  ];
}

describe("resolveEntityRef", () => {
  const layers = layersWith([slime("s1", 4), linkNode("l1", "s1", 5)]);

  test("resolves placement-id and numeric refs, rejects 0 and unknowns", () => {
    expect(resolveEntityRef(layers, "s1")?.id).toBe("s1");
    expect(resolveEntityRef(layers, 4)?.id).toBe("s1");
    expect(resolveEntityRef(layers, 0)).toBeNull();
    expect(resolveEntityRef(layers, 99)).toBeNull();
    expect(resolveEntityRef(layers, "gone")).toBeNull();
  });
});

describe("remapPastedEntityRefs", () => {
  test("refs between copied entities follow the copies", () => {
    const originals = [slime("s1", 4), linkNode("l1", "s1", 5)];
    const newIds = new Map([
      ["s1", "s1-copy"],
      ["l1", "l1-copy"]
    ]);
    const remapped = remapPastedEntityRefs(
      "IOLinkNode",
      { target: "s1" },
      originals,
      newIds
    );
    expect(remapped).toEqual({ target: "s1-copy" });
  });

  test("legacy numeric refs into the copied set are remapped too", () => {
    const originals = [slime("s1", 4), linkNode("l1", 4, 5)];
    const newIds = new Map([
      ["s1", "s1-copy"],
      ["l1", "l1-copy"]
    ]);
    const remapped = remapPastedEntityRefs(
      "IOLinkNode",
      { target: 4 },
      originals,
      newIds
    );
    expect(remapped).toEqual({ target: "s1-copy" });
  });

  test("refs to entities outside the copied set keep their target", () => {
    const originals = [linkNode("l1", "outside", 5)];
    const newIds = new Map([["l1", "l1-copy"]]);
    const props = { target: "outside" };
    expect(remapPastedEntityRefs("IOLinkNode", props, originals, newIds)).toBe(
      props
    );
  });
});

describe("toRuntimeEntityRefProperties", () => {
  const layers = layersWith([slime("s1", 4)]);

  test("converts placement-id refs to the target's Tiled object id", () => {
    expect(
      toRuntimeEntityRefProperties("IOLinkNode", { target: "s1" }, layers)
    ).toEqual({ target: 4 });
  });

  test("dangling refs become 0 and numeric refs pass through", () => {
    expect(
      toRuntimeEntityRefProperties("IOLinkNode", { target: "gone" }, layers)
    ).toEqual({ target: 0 });
    const numeric = { target: 7 };
    expect(toRuntimeEntityRefProperties("IOLinkNode", numeric, layers)).toBe(
      numeric
    );
  });
});

describe("normalizeEntityRefsAfterLoad", () => {
  test("dedupes object ids, resolves refs to the keeper, raises the counter", () => {
    const keeper = slime("first", 4);
    const impostor = slime("second", 4);
    const link = linkNode("l1", 4, 6);
    const layers = layersWith([keeper, impostor, link]);

    const nextObjectId = normalizeEntityRefsAfterLoad(layers, 5);

    expect(keeper.tiledObjectId).toBe(4);
    expect(impostor.tiledObjectId).toBe(7);
    expect(link.properties?.target).toBe("first");
    expect(nextObjectId).toBe(8);
  });

  test("keeps unresolvable numeric refs and drops zero refs", () => {
    const dangling = linkNode("l1", 55, 1);
    const unset = linkNode("l2", 0, 2);
    normalizeEntityRefsAfterLoad(layersWith([dangling, unset]), 3);
    expect(dangling.properties?.target).toBe(55);
    expect(unset.properties?.target).toBeUndefined();
  });
});
