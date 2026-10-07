import RAPIER from "@dimforge/rapier2d-compat";
import { Group, Object3D } from "three";

import { BaseEntityType } from "src/api/entity";

import { Level } from "./Level";

function makeEntity(id: string, layerName?: string) {
  return {
    id,
    type: "TestEntity",
    initialProps: {},
    object3D: new Object3D(),
    layerName
  } as unknown as BaseEntityType;
}

describe("Level entity layer groups", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  test("entities on a hidden layer land under an invisible group", () => {
    const level = new Level("test", RAPIER);
    level.registerHiddenEntityLayer("secrets");

    const hidden = makeEntity("hidden", "secrets");
    const unlayered = makeEntity("unlayered");
    level.addEntity(hidden);
    level.addEntity(unlayered);

    const parent = hidden.object3D?.parent;
    expect(parent).toBeInstanceOf(Group);
    expect(parent?.visible).toBe(false);
    expect(unlayered.object3D?.parent).toBe(level.scene);
  });

  test("layer visibility can be toggled at runtime", () => {
    const level = new Level("test", RAPIER);
    const entity = makeEntity("visible", "props");
    level.addEntity(entity);

    expect(entity.object3D?.parent?.visible).toBe(true);
    level.setEntityLayerVisibility("props", false);
    expect(entity.object3D?.parent?.visible).toBe(false);
    level.setEntityLayerVisibility("props", true);
    expect(entity.object3D?.parent?.visible).toBe(true);
  });

  test("removing an entity detaches it from its layer group", () => {
    const level = new Level("test", RAPIER);
    const entity = makeEntity("removed", "props");
    level.addEntity(entity);
    level.removeEntity("removed");

    expect(entity.object3D?.parent).toBeNull();
  });
});
