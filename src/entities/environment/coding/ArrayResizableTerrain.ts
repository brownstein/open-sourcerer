import { Vector3 } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { ColorRepresentation, isNumberArray } from "src/api/util";
import { SpriteAssets } from "src/assets/allSpriteAssets";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { ReadSizeAttributes } from "src/engine/util/vecTypes";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

import { ResizableTerrain } from "../ResizableTerrain";

export type ArrayResizableTerrainProps = EntityProps & {
  sprite?: keyof SpriteAssets;
  color?: ColorRepresentation;
  alignment?: "top" | "right" | "bottom" | "left";
  numElements?: number;
  initialLengths?: number[];
  initialFractionalLengths?: number[];
};

// gap in asset management I thoguth would not be a problem but slightly is,
// we should be able to set consumer dependencies with passed props
@setConsumerDependencies(() => [ResizableTerrain])
@setAssetDependencies<ArrayResizableTerrainProps>((props) =>
  props?.sprite ? [props.sprite] : []
)
export class ArrayResizableTerrain extends CoreEntity {
  static readonly type = "ArrayResizableTerrain";
  public readonly type = ArrayResizableTerrain.type;

  public behaviors = {
    signal: new SignalConnectionBehavior()
  };

  private readonly resizableTerrains: ResizableTerrain[] = [];
  private readonly dimensionToResize: "width" | "height";

  constructor(props: ArrayResizableTerrainProps) {
    super(props);

    this.behaviors.signal.init(this);

    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (isNumberArray(signal.value)) {
          this.setElementLengthsFromArray(signal.value);
        }
      }
    );

    const alignment = props.alignment ?? "bottom";
    const numElements = props.numElements ?? 3;

    const Z_AXIS = new Vector3(0, 0, 1);

    switch (alignment) {
      case "top":
      case "bottom": {
        this.dimensionToResize = "height";

        const alignY = alignment;
        const widthPerTerrain = this.size.width / numElements;
        const heightPerTerrain = this.size.height;

        const halfWidthPerTerrain = widthPerTerrain * 0.5;

        const halfWidth = this.size.width * 0.5;
        const leftMostX = this.position.x - halfWidth;

        for (let i = 0; i < numElements; i++) {
          const positionX =
            leftMostX + widthPerTerrain * i + halfWidthPerTerrain;
          const terrainPosition = this.position.clone().setX(positionX);

          // take into account angle
          terrainPosition
            .sub(this.position)
            .applyAxisAngle(Z_AXIS, this.angle)
            .add(this.position);

          const terrainSize: ReadSizeAttributes = {
            width: widthPerTerrain,
            height: heightPerTerrain
          };

          const newTerrain = new ResizableTerrain({
            ...props,
            id: undefined,
            sprite: props.sprite,
            color: props.color,
            alignY: alignY,
            size: terrainSize,
            position: terrainPosition
          });

          this.resizableTerrains.push(newTerrain);
        }

        break;
      }
      case "right":
      case "left": {
        this.dimensionToResize = "width";

        const alignX = alignment;
        const widthPerTerrain = this.size.width;
        const heightPerTerrain = this.size.height / numElements;

        const halfHeightPerTerrain = heightPerTerrain * 0.5;

        const halfHeight = this.size.height * 0.5;
        const bottomMostY = this.position.y - halfHeight;

        for (let i = 0; i < numElements; i++) {
          const positionY =
            bottomMostY + heightPerTerrain * i + halfHeightPerTerrain;
          const terrainPosition = this.position.clone().setY(positionY);

          // take into account angle
          terrainPosition
            .sub(this.position)
            .applyAxisAngle(Z_AXIS, this.angle)
            .add(this.position);

          const terrainSize: ReadSizeAttributes = {
            width: widthPerTerrain,
            height: heightPerTerrain
          };

          const newTerrain = new ResizableTerrain({
            ...props,
            id: undefined,
            sprite: props.sprite,
            color: props.color,
            alignX: alignX,
            size: terrainSize,
            position: terrainPosition
          });

          this.resizableTerrains.push(newTerrain);
        }

        break;
      }
    }

    const initialLengths = props.initialLengths ?? [];
    const initialFractionalLengths = props.initialFractionalLengths ?? [];

    this.setElementLengthsFromArrayInstant(initialLengths);
    this.setElementFractionalLengthsFromArrayInstant(initialFractionalLengths);
  }

  get length(): number {
    return this.resizableTerrains.length;
  }

  setElementLength(index: number, length: number): void {
    const terrainToResize = this.resizableTerrains.at(index);
    if (!terrainToResize) return;

    const clampedLength =
      this.dimensionToResize === "width"
        ? clamp(length, 0, this.size.width)
        : clamp(length, 0, this.size.height);

    if (this.dimensionToResize === "width")
      terrainToResize.setWidth(clampedLength);
    else terrainToResize.setHeight(clampedLength);
  }

  setElementLengthInstant(index: number, length: number): void {
    const terrainToResize = this.resizableTerrains.at(index);
    if (!terrainToResize) return;

    const clampedLength =
      this.dimensionToResize === "width"
        ? clamp(length, 0, this.size.width)
        : clamp(length, 0, this.size.height);

    if (this.dimensionToResize === "width")
      terrainToResize.setWidthInstant(clampedLength);
    else terrainToResize.setHeightInstant(clampedLength);
  }

  setElementFractionalLength(index: number, fractionalLength: number): void {
    const clampedFractionalLength = clamp(fractionalLength, 0, 1);
    const resolvedLength =
      this.dimensionToResize === "width"
        ? this.size.width * clampedFractionalLength
        : this.size.height * clampedFractionalLength;

    this.setElementLength(index, resolvedLength);
  }

  setElementFractionalLengthInstant(
    index: number,
    fractionalLength: number
  ): void {
    const clampedFractionalLength = clamp(fractionalLength, 0, 1);
    const resolvedLength =
      this.dimensionToResize === "width"
        ? this.size.width * clampedFractionalLength
        : this.size.height * clampedFractionalLength;

    this.setElementLengthInstant(index, resolvedLength);
  }

  setAllLength(length: number): void {
    for (let i = 0; i < this.length; i++) {
      this.setElementLength(i, length);
    }
  }

  setAllLengthInstant(length: number): void {
    for (let i = 0; i < this.length; i++) {
      this.setElementLengthInstant(i, length);
    }
  }

  setElementLengthsFromArray(lengths: number[]): void {
    lengths.forEach((length, index) => this.setElementLength(index, length));
  }

  setElementLengthsFromArrayInstant(lengths: number[]): void {
    lengths.forEach((length, index) =>
      this.setElementLengthInstant(index, length)
    );
  }

  setElementFractionalLengthsFromArray(fractionalLengths: number[]): void {
    fractionalLengths.forEach((fractionalLength, index) =>
      this.setElementFractionalLength(index, fractionalLength)
    );
  }

  setElementFractionalLengthsFromArrayInstant(
    fractionalLengths: number[]
  ): void {
    fractionalLengths.forEach((fractionalLength, index) =>
      this.setElementFractionalLengthInstant(index, fractionalLength)
    );
  }

  setAllFractionalLength(fractionalLength: number): void {
    for (let i = 0; i < this.length; i++) {
      this.setElementFractionalLength(i, fractionalLength);
    }
  }

  setAllFractionalLengthInstant(fractionalLength: number): void {
    for (let i = 0; i < this.length; i++) {
      this.setElementFractionalLengthInstant(i, fractionalLength);
    }
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    this.resizableTerrains.forEach((terrain) => level.addEntity(terrain));
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);

    this.resizableTerrains.forEach((terrain) => level.removeEntity(terrain.id));
  }
}
