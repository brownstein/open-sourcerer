import {
  kLoaderAssignedEntityProps,
  parseMap,
  parseObjectProperties
} from "./parseMap";
import { parseTileset } from "./parseTileset";
import simpleLevel from "./test-data/simpleLevel.tmj";
import adveTiles from "./test-data/tiles16.tsj";
import { ITiledLevelJSONObject } from "./tiledJson";

describe("parseObjectProperties", () => {
  test("unwraps Tiled list properties into plain arrays", () => {
    const obj = {
      properties: [
        { name: "speed", type: "float", value: 2.5 },
        {
          name: "initialLengths",
          type: "list",
          value: [
            { type: "int", value: 16 },
            { type: "int", value: 0 },
            { type: "int", value: 32 }
          ]
        },
        {
          name: "mixed",
          type: "list",
          value: [
            { type: "string", value: "a" },
            { type: "color", value: "#ff000000" },
            { type: "int", value: -3 }
          ]
        },
        {
          name: "nested",
          type: "list",
          value: [
            {
              type: "list",
              value: [
                { type: "int", value: 1 },
                { type: "int", value: 2 }
              ]
            }
          ]
        }
      ]
    } as unknown as ITiledLevelJSONObject;

    const result = parseObjectProperties(obj);
    expect(result.speed).toBe(2.5);
    expect(result.initialLengths).toEqual([16, 0, 32]);
    expect(result.mixed).toEqual(["a", "#ff000000", -3]);
    expect(result.nested).toEqual([[1, 2]]);
  });

  test("passes Tiled class properties through as plain objects", () => {
    const obj = {
      properties: [
        {
          name: "tester",
          type: "class",
          propertytype: "tester",
          value: { another: 10.12, monkey: 9, ok: "a good string", on: true }
        },
        {
          name: "nestedObject",
          type: "class",
          propertytype: "nest",
          value: {
            nested: { ok: "this is another string" },
            testing: "property outside of the nesting"
          }
        },
        {
          name: "withLists",
          type: "class",
          propertytype: "conversation",
          value: {
            speakers: ["Adana", "Player"],
            options: [
              { text: "Yes", next: "accept" },
              { text: "No", next: "decline" }
            ]
          }
        },
        {
          name: "withMultiline",
          type: "class",
          propertytype: "step",
          value: { text: "first line\nsecond line" }
        },
        { name: "emptyClass", type: "class", propertytype: "nest" }
      ]
    } as unknown as ITiledLevelJSONObject;

    const result = parseObjectProperties(obj);
    expect(result.tester).toEqual({
      another: 10.12,
      monkey: 9,
      ok: "a good string",
      on: true
    });
    expect(result.nestedObject).toEqual({
      nested: { ok: "this is another string" },
      testing: "property outside of the nesting"
    });
    expect(result.withLists).toEqual({
      speakers: ["Adana", "Player"],
      options: [
        { text: "Yes", next: "accept" },
        { text: "No", next: "decline" }
      ]
    });
    expect(result.withMultiline).toEqual({ text: "first line\nsecond line" });
    expect(result.emptyClass).toEqual({});
  });

  test("leaves unset class members absent", () => {
    const obj = {
      properties: [
        {
          name: "step",
          type: "class",
          propertytype: "step",
          value: { speaker: "Adana" }
        }
      ]
    } as unknown as ITiledLevelJSONObject;

    const step = parseObjectProperties(obj).step as Record<string, unknown>;
    expect(Object.keys(step)).toEqual(["speaker"]);
    expect("next" in step).toBe(false);
    expect(step.next).toBeUndefined();
  });
});

describe("parseMap", () => {
  test("overwrites loader-assigned props with the Tiled object's own values", () => {
    const levelJson = JSON.parse(
      JSON.stringify(simpleLevel)
    ) as typeof simpleLevel;
    const objectLayer = levelJson.layers.find(
      (layer: { objects?: unknown }) => "objects" in layer
    );
    if (!objectLayer || !("objects" in objectLayer))
      throw new Error("object layer missing");
    const obj = objectLayer.objects[0];
    obj.type = "Slime";
    obj.name = "Blobby";
    (obj as { properties?: unknown }).properties = kLoaderAssignedEntityProps
      .filter((name) => name !== "position" && name !== "size")
      .map((name) => ({ name, type: "string", value: "hand-authored" }));

    const parsed = parseMap({
      levelJson,
      tileSets: { tiles16: parseTileset(adveTiles) }
    });
    const entityLayer = parsed.layers.find((l) => l.type === "entities");
    if (entityLayer?.type !== "entities") throw new Error("no entity layer");
    const props = entityLayer.entities[0].props;

    expect(props.id).toBe(`tle-${obj.id}`);
    expect(props.name).toBe("Blobby");
    expect(props.inLevelDef).toBe(true);
    expect(props.layerName).toBe(objectLayer.name);
    expect(props.angle).toBe(-0);
  });

  test("keeps entities on hidden object layers, flagged not visible", () => {
    const levelJson = JSON.parse(
      JSON.stringify(simpleLevel)
    ) as typeof simpleLevel;
    const objectLayer = levelJson.layers.find(
      (layer: { objects?: unknown }) => "objects" in layer
    );
    if (!objectLayer || !("objects" in objectLayer))
      throw new Error("object layer missing");
    objectLayer.visible = false;

    const parsed = parseMap({
      levelJson,
      tileSets: { tiles16: parseTileset(adveTiles) }
    });
    const entityLayer = parsed.layers.find((l) => l.type === "entities");
    if (entityLayer?.type !== "entities") throw new Error("no entity layer");

    expect(entityLayer.visible).toBe(false);
    expect(entityLayer.entities.length).toBe(objectLayer.objects.length);
  });

  test("Parses the simple level.", () => {
    const adveTileset = parseTileset(adveTiles);
    const parsed = parseMap({
      levelJson: simpleLevel,
      tileSets: {
        tiles16: adveTileset
      }
    });
    expect(parsed.bbox.isEmpty()).toBeFalsy();
    expect(parsed.layers.length).toEqual(simpleLevel.layers.length);
    for (const layer of parsed.layers) {
      if (layer.type === "tiles") {
        for (const terrain of layer.terrain) {
          expect(terrain.polygon).toBeTruthy();
          expect(terrain.convexComponentPolygons).toBeTruthy();
        }
      }
      if (layer.type === "entities") {
        expect(layer.entities).toBeTruthy();
      }
    }
  });
});
