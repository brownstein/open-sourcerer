import {
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography
} from "@mui/material";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMeasure } from "react-use";
import shortid from "shortid";
import { Color, OrthographicCamera, Vector2, Vector3 } from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import {
  kPixelScale,
  roundFractionalPixels
} from "src/engine/constants/scaling";
import { Level } from "src/engine/level/Level";
import { LevelLoader } from "src/engine/level/LevelLoader";
import { ViewportRenderingContext } from "src/engine/rendering/CentralRenderer";
import entityMetadataRaw from "src/entities/metadata/allEntitiesMetadata.json";
import {
  EntityArgEntry,
  EntityTypeSignature,
  PrimitiveTypeName,
  ValueSchema
} from "src/entities/metadata/metadataTypes";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { nextAnimationFrame } from "src/util/animationPromise";

import {
  constrainCameraToSceneBBox,
  sizeCameraToCanvas
} from "../viewport/util";
import "./EntityVisualizer.less";

const entityMetadata = entityMetadataRaw as EntityTypeSignature[];

// The field editors key off scalar type names, so a list of scalars counts too.
function scalarSchemaOf(
  arg: EntityArgEntry
): Extract<ValueSchema, { kind: PrimitiveTypeName }> | undefined {
  const schema = arg.schema?.kind === "array" ? arg.schema.element : arg.schema;
  if (!schema) return undefined;
  return schema.kind === "array" ||
    schema.kind === "object" ||
    schema.kind === "record" ||
    schema.kind === "entityRef"
    ? undefined
    : schema;
}

export type VisualizerControllerProps = {
  level?: string;
};

export class VisualizerController {
  public level?: Level;
  public loadProgress?: number;
  public events = createTypedEventEmitter<{
    loadProgress: number;
    levelReady: void;
    frame: number;
    spawnSuccess: void;
    spawnError: string;
  }>();

  private destroyed = false;
  private levelLoader = new LevelLoader("Visualizer");
  private spawnedEntity?: BaseEntityType;
  private spawning = false;

  constructor(props?: VisualizerControllerProps) {
    if (props?.level) this.levelLoader = new LevelLoader(props.level);
    this.levelLoader.on("progress", (progress) => {
      this.loadProgress = progress;
      this.events.emit("loadProgress", progress);
    });
    this._initialLoad();
  }
  destroy() {
    this.destroyed = true;
    this.level?.dispose();
  }
  async _initialLoad() {
    this.level = await this.levelLoader.load();
    this.level.scene.background = null;
    this.events.emit("levelReady");
    this._timeLoop();
  }
  async _timeLoop() {
    let lastTime = performance.now();
    while (!this.destroyed) {
      const currTime = performance.now();
      const ms = currTime - lastTime;
      lastTime = currTime;
      this.level?.step(ms);
      this.events.emit("frame", ms);
      await nextAnimationFrame();
    }
  }
  async spawnEntity(entityType: string, props: Partial<EntityProps>) {
    if (!this.level || this.spawning) return;
    const marker = this.level.getEntityForName("SpawnPoint");
    if (!marker) return;
    const fullProps: EntityProps = {
      id: shortid(),
      type: entityType,
      position: marker.position,
      size: {
        width: 0.5,
        height: 0.5
      },
      polygon: [
        new Vector2(-1, -1),
        new Vector2(1, -1),
        new Vector2(1, 1),
        new Vector2(-1, 1)
      ],
      polyline: [
        new Vector2(-1, -1),
        new Vector2(1, -1),
        new Vector2(1, 1),
        new Vector2(-1, 1)
      ],
      ...props
    };
    if (this.spawnedEntity) {
      for (const entity of this.level.getEntities().values()) {
        if (
          isTerrain(entity) ||
          entity === marker ||
          entity.type === "PhysicsDebugger"
        )
          continue;
        this.level.removeEntity(entity.id);
      }
      this.spawnedEntity.destroy?.();
      this.spawnedEntity = undefined;
    }
    let spawned: BaseEntityType | null;
    try {
      this.spawning = true;
      spawned = await this.level.constructEntityAfterPreload(
        entityType,
        fullProps
      );
      this.spawning = false;
    } catch (err) {
      this.events.emit("spawnError", (err as Error).message);
      this.spawning = false;
      return;
    }
    if (spawned) {
      this.spawnedEntity = spawned;
      this.level?.addEntity(spawned);
      this.events.emit("spawnSuccess");
    }
  }
  hitEntity() {
    if (this.spawnedEntity)
      this.spawnedEntity.hit?.({
        damage: 5,
        hittingEntity: this.spawnedEntity,
        sourceEntity: this.spawnedEntity
      });
  }
}

export function VisualizerTab() {
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iState = useRef<{
    controller?: VisualizerController;
    viewportRenderingContext?: ViewportRenderingContext;
    camera?: OrthographicCamera;
  }>({});
  const [needsResize, setNeedsResize] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [entityProps, setEntityProps] = useState<Partial<EntityProps>>({});
  const [entitySpawnError, setEntitySpawnError] = useState("");

  useEffect(() => {
    const iStateCurrent = iState.current;
    const controller = new VisualizerController();

    iStateCurrent.controller = controller;

    iStateCurrent.camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    iStateCurrent.camera.up = new Vector3(0, 1, 0);
    iStateCurrent.camera.lookAt(new Vector3(0, 0, -1));

    const onControllerLevelReady = () => {
      const rCanvas = canvasRef.current;
      // This should not happen...
      if (!rCanvas || !controller.level) {
        controller.destroy();
        iStateCurrent.controller = undefined;
        return;
      }
      iStateCurrent.viewportRenderingContext = new ViewportRenderingContext(
        rCanvas,
        {
          clearAlpha: 1,
          clearColor: new Color(11 / 256, 12 / 256, 15 / 256)
        }
      );
      iStateCurrent.viewportRenderingContext.clearAlpha = 0;
      controller.level.cameraDirector.setDefaultProperties({
        size: new Vector2(10, 10),
        center: new Vector2()
      });
      setNeedsResize(true);
    };

    if (controller.loadProgress === 1) {
      onControllerLevelReady();
    } else {
      controller.events.once("levelReady", onControllerLevelReady);
    }

    controller.events.on("spawnError", (err) => setEntitySpawnError(err));
    controller.events.on("spawnSuccess", () => setEntitySpawnError(""));

    return () => {
      controller.destroy();
      iStateCurrent.controller = undefined;
    };
  }, []);

  useEffect(() => {
    const iStateCurrent = iState.current;
    const canvas = canvasRef.current;

    const { controller, viewportRenderingContext, camera } = iStateCurrent;

    const onFrame = () => {
      if (
        !canvas ||
        !controller?.level?.cameraDirector ||
        !viewportRenderingContext ||
        !camera
      )
        return;
      const worldBounds = controller.level.getWorldBoundaries();
      const worldSize = new Vector2();
      const worldCenter = new Vector2();
      worldBounds.getSize(worldSize);
      worldBounds.getCenter(worldCenter);

      const canvasRect = canvas.getBoundingClientRect();
      if (!canvasRect) return;

      viewportRenderingContext.resizeCamera(
        worldSize.x * kPixelScale,
        worldSize.y * kPixelScale
      );
      viewportRenderingContext.resizeCanvas(
        canvasRect.width,
        canvasRect.height,
        window.devicePixelRatio
      );

      controller.level.cameraDirector.setDefaultProperties({
        bounds: worldBounds
      });

      const cameraProperties =
        controller.level.cameraDirector.resolveRequests();

      sizeCameraToCanvas(cameraProperties, canvasRect);
      constrainCameraToSceneBBox(cameraProperties);

      camera.position.x = roundFractionalPixels(cameraProperties.center.x);
      camera.position.y = roundFractionalPixels(cameraProperties.center.y);
      camera.position.z = 32;
      const cameraSize = cameraProperties.size;
      camera.left = roundFractionalPixels(-cameraSize.x * 0.5);
      camera.right = roundFractionalPixels(cameraSize.x * 0.5);
      camera.top = roundFractionalPixels(cameraSize.y * 0.5);
      camera.bottom = roundFractionalPixels(-cameraSize.y * 0.5);
      camera.updateProjectionMatrix();

      viewportRenderingContext.render(controller.level.scene, camera);
    };
    setNeedsResize(false);
    onFrame();
    controller?.events.on("frame", onFrame);
    return () => {
      controller?.events.off("frame", onFrame);
    };
  }, [needsResize, containerRect]);

  const entityDef = useMemo(() => {
    return entityMetadata.find((t) => entityType === t.name);
  }, [entityType]);

  useEffect(() => {
    setEntityProps((currProps) => {
      const newProps = { ...currProps };
      for (const [propName, _propVal] of Object.entries(currProps)) {
        if (entityDef?.args.find((a) => a.name === propName)) continue;
        delete newProps[propName];
      }
      return newProps;
    });
  }, [entityDef]);

  useEffect(() => {
    const { controller } = iState.current;
    if (!controller) return;
    controller.spawnEntity(entityType, entityProps);
  }, [entityType, entityDef, entityProps]);

  const sortedMetadata = useMemo(() => {
    const ret = [...entityMetadata];
    ret.sort((a, b) => a.name.localeCompare(b.name));
    return ret;
  }, []);

  const allProps = useMemo(() => {
    if (!entityDef) return [];
    const propPairs: [string, string][] = [];
    for (const arg of entityDef.args) {
      switch (arg.name) {
        case "id":
        case "name":
        case "inLevelDef":
        case "layerName":
          continue;
      }
      const scalar = scalarSchemaOf(arg);
      propPairs.push([arg.name, scalar ? scalar.kind : arg.type]);
    }
    propPairs.sort(([a], [b]) => a.localeCompare(b));
    return propPairs;
  }, [entityDef]);

  const propEnumValues = useMemo(() => {
    if (!entityDef) return undefined;
    const map: Record<string, string[]> = {};
    for (const arg of entityDef.args) {
      const enumValues = scalarSchemaOf(arg)?.enumValues;
      if (enumValues && enumValues.length > 0) map[arg.name] = enumValues;
    }
    return map;
  }, [entityDef]);

  const setValueDeep = useCallback((valuePathStr: string, value: unknown) => {
    const valuePath = valuePathStr.split(".");
    setEntityProps((props) => {
      let vIndex = 0;
      const newProps = { ...props };
      let obj: any = newProps;
      while (vIndex < valuePath.length - 1) {
        const subPath = valuePath[vIndex];
        if (Array.isArray(obj)) {
          const subPathNo = Number(subPath);
          obj = obj[subPathNo];
          vIndex++;
          continue;
        }
        if (typeof obj === "object" && obj !== null) {
          if (!(subPath in obj)) obj[subPath] = {};
          obj = obj[subPath];
          vIndex++;
          continue;
        }
        vIndex++;
      }
      if (value === undefined) {
        delete obj[valuePath.at(-1) ?? ""];
      } else {
        obj[valuePath.at(-1) ?? ""] = value;
      }
      return newProps;
    });
  }, []);

  return (
    <div
      className="visualizer-tab"
      ref={containerRef}
      style={
        {
          "--containerWidth": `${containerRect.width}px`,
          "--containerHeight": `${containerRect.height}px`
        } as React.CSSProperties
      }
    >
      <div className="visualizer-canvas-container">
        <canvas ref={canvasRef} className={cx("visualizer-canvas")} />
      </div>
      <div className="visualizer-entity-type-selector">
        <FormControl fullWidth>
          <InputLabel id="visualizer-select-entity-type">
            Entity Type
          </InputLabel>
          <Select
            labelId="visualizer-select-entity-type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            label="Entity Type"
          >
            {sortedMetadata.map((m) => (
              <MenuItem key={m.name} value={m.name}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
          {entityDef?.docString && (
            <div className="visualizer-entity-docstring">
              {entityDef.docString}
            </div>
          )}
          {entitySpawnError !== "" && (
            <div className="visualizer-entity-spawn-error">
              {entitySpawnError}
            </div>
          )}
          {entityDef && (
            <div className="visualizer-entity-props">
              <ObjectField
                propertyTypes={allProps}
                propertyEnumValues={propEnumValues}
                value={entityProps}
                setValue={setValueDeep}
              />
              <div className="visualizer-sub-object">
                <Typography>Interactions</Typography>
                <Button onClick={() => iState.current.controller?.hitEntity()}>
                  Hit
                </Button>
              </div>
            </div>
          )}
        </FormControl>
      </div>
    </div>
  );
}

type PrimitiveFieldProps = {
  fieldName: string;
  primitiveType: string;
  value: unknown;
  min?: number;
  max?: number;
  defaultValue?: unknown;
  enumValues?: string[];
  setValue: (fieldName: string, value: unknown) => void;
};

function PrimitiveField(props: PrimitiveFieldProps) {
  const {
    fieldName,
    primitiveType,
    value,
    setValue,
    min,
    max,
    defaultValue,
    enumValues
  } = props;
  if (primitiveType === "boolean") {
    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={!!value}
            onChange={(e) => setValue(fieldName, !!e.target.checked)}
          />
        }
        label={fieldName}
      />
    );
  }
  if (primitiveType === "number") {
    const valueWithDefault =
      typeof value === "number"
        ? value
        : typeof defaultValue === "number"
          ? defaultValue
          : 1;
    return (
      <div>
        <Typography>
          {fieldName} : {valueWithDefault}
        </Typography>
        <Slider
          min={min ?? 0}
          max={max ?? 32}
          step={0.1}
          value={valueWithDefault}
          onChange={(_e, newValue: number | number[]) =>
            setValue(fieldName, Number(newValue))
          }
        />
      </div>
    );
  }
  if (primitiveType === "string") {
    const valueWithDefault =
      typeof value === "string"
        ? value
        : typeof defaultValue === "string"
          ? defaultValue
          : "";
    if (enumValues && enumValues.length > 0) {
      return (
        <FormControl size="small" fullWidth>
          <InputLabel>{fieldName}</InputLabel>
          <Select
            label={fieldName}
            value={valueWithDefault}
            onChange={(e) => setValue(fieldName, e.target.value)}
          >
            {enumValues.map((ev) => (
              <MenuItem key={ev} value={ev}>
                {ev}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    return (
      <TextField
        label={fieldName}
        value={valueWithDefault}
        onChange={(e) => setValue(fieldName, e.target.value)}
      />
    );
  }
  return null;
}

type ObjectFieldProps<
  T extends Record<string, unknown> = Record<string, unknown>
> = {
  fieldName?: string;
  propertyTypes: [string, string][];
  propertyDefaults?: Record<string, unknown>;
  propertyRanges?: Record<string, [number, number]>;
  propertyEnumValues?: Record<string, string[]>;
  value?: T;
  setValue: (fieldName: string, value: unknown) => void;
};

function ObjectField<
  T extends Record<string, unknown> = Record<string, unknown>
>(props: ObjectFieldProps<T>) {
  const {
    fieldName,
    propertyTypes,
    propertyDefaults,
    propertyRanges,
    propertyEnumValues,
    value,
    setValue
  } = props;

  const setSubValue = useCallback(
    (subFieldName: string, value: unknown) => {
      if (fieldName === undefined) {
        setValue(subFieldName, value);
        return;
      }
      setValue(`${fieldName}.${subFieldName}`, value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldName, propertyTypes, setValue]
  );

  let informedDefault: unknown = {};
  switch (fieldName) {
    case "size":
      informedDefault = { width: 1, height: 1 };
      break;
    default:
      break;
  }

  return (
    <div className="visualizer-sub-object">
      <Typography>{fieldName}</Typography>
      {!value && (
        <div>
          <Button onClick={() => setValue(fieldName ?? "", informedDefault)}>
            Add Value
          </Button>
        </div>
      )}
      {value && fieldName && (
        <div>
          <Button onClick={() => setValue(fieldName ?? "", undefined)}>
            Remove Value
          </Button>
        </div>
      )}
      {value &&
        propertyTypes.map(([propName, propType]) => {
          switch (propType) {
            case "boolean":
            case "number":
            case "string":
              let range = propertyRanges?.[propName];
              let defaultValue = propertyDefaults?.[propName];
              if (!range && propName === "opacity") range = [0, 1];
              if (!range && propName === "angle") range = [-Math.PI, Math.PI];
              if (defaultValue === undefined && propName === "opacity")
                defaultValue = 1;
              return (
                <PrimitiveField
                  key={propName}
                  fieldName={propName}
                  primitiveType={propType}
                  value={value?.[propName]}
                  defaultValue={defaultValue}
                  min={range?.[0]}
                  max={range?.[1]}
                  enumValues={propertyEnumValues?.[propName]}
                  setValue={setSubValue}
                />
              );
            case "IVector2":
              if (typeof value !== "object" || value === null) return null;
              return (
                <ObjectField
                  key={propName}
                  fieldName={propName}
                  value={(value[propName] as T | undefined) ?? undefined}
                  propertyTypes={[
                    ["x", "number"],
                    ["y", "number"]
                  ]}
                  propertyRanges={{
                    x: [-5, 5],
                    y: [-5, 5]
                  }}
                  propertyDefaults={{
                    x: 0,
                    y: 0
                  }}
                  setValue={setSubValue}
                />
              );
            case "IVector3":
            case "ReadPositionAttributes":
              if (typeof value !== "object" || value === null) return null;
              return (
                <ObjectField
                  key={propName}
                  fieldName={propName}
                  value={(value[propName] as T | undefined) ?? undefined}
                  propertyTypes={[
                    ["x", "number"],
                    ["y", "number"],
                    ["z", "number"]
                  ]}
                  propertyRanges={{
                    x: [-5, 5],
                    y: [-5, 5],
                    z: [-5, 5]
                  }}
                  propertyDefaults={{
                    x: 0,
                    y: 0,
                    z: 0
                  }}
                  setValue={setSubValue}
                />
              );
            case "ReadSizeAttributes":
              if (typeof value !== "object" || value === null) return null;
              return (
                <ObjectField
                  key={propName}
                  fieldName={propName}
                  value={(value[propName] as T | undefined) ?? undefined}
                  propertyTypes={[
                    ["width", "number"],
                    ["height", "number"]
                  ]}
                  propertyRanges={{
                    width: [0, 4],
                    height: [0, 4]
                  }}
                  propertyDefaults={{
                    width: 1,
                    height: 1
                  }}
                  setValue={setSubValue}
                />
              );
            default:
              break;
          }
          return null;
        })}
    </div>
  );
}
