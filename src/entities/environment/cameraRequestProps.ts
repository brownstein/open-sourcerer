import { Box2, Vector2 } from "three";

import {
  CameraProperties,
  CameraRequest,
  CameraRequestCombinationMode,
  CameraRequestPriority
} from "src/api/camera";

/**
 * Tiled-authorable camera request configuration, shared by CameraZone and
 * IOCameraRequestNode.
 * NOTE: each camera property has to be redefined as a flat prop — this is the
 * only way to support getting the custom properties from Tiled.
 */
export type CameraRequestTiledProps = {
  priority?: number;
  influence?: number;
  transitionDuration?: number;
  transitionSmoothing?: number;
  startActivated?: boolean;

  centerX?: number;
  centerY?: number;
  sizeX?: number;
  sizeY?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  boundsMinX?: number;
  boundsMinY?: number;
  boundsMaxX?: number;
  boundsMaxY?: number;
  distort?: number;
  compositeOpacity?: number;
  shake?: number;
  letterboxingPercentage?: number;

  boundLeft?: boolean;
  boundRight?: boolean;
  boundTop?: boolean;
  boundBottom?: boolean;
};

/**
 * Applies the explicitly authored camera props over `base` (preset-derived
 * properties, for callers that have them), then unrestricts the bound sides
 * that are configured off. If any bound side flag is set, unset sides default
 * to unbounded; if none are set, all sides stay bounded.
 */
export function buildCameraProperties(
  props: CameraRequestTiledProps,
  base: Partial<CameraProperties> = {}
): Partial<CameraProperties> {
  const cameraProperties: Partial<CameraProperties> = { ...base };

  if (props.centerX !== undefined && props.centerY !== undefined) {
    cameraProperties.center = new Vector2(props.centerX, props.centerY);
  }
  if (props.sizeX !== undefined && props.sizeY !== undefined) {
    cameraProperties.size = new Vector2(props.sizeX, props.sizeY);
  }
  if (props.offsetX !== undefined || props.offsetY !== undefined) {
    cameraProperties.offset = new Vector2(props.offsetX, props.offsetY);
  }
  if (props.rotation !== undefined) cameraProperties.rotation = props.rotation;
  if (
    props.boundsMinX !== undefined &&
    props.boundsMinY !== undefined &&
    props.boundsMaxX !== undefined &&
    props.boundsMaxY !== undefined
  ) {
    cameraProperties.bounds = new Box2(
      new Vector2(props.boundsMinX, props.boundsMinY),
      new Vector2(props.boundsMaxX, props.boundsMaxY)
    );
  }
  if (props.distort !== undefined) cameraProperties.distort = props.distort;
  if (props.compositeOpacity !== undefined) {
    cameraProperties.compositeOpacity = props.compositeOpacity;
  }
  if (props.shake !== undefined) cameraProperties.shake = props.shake;
  if (props.letterboxingPercentage !== undefined) {
    cameraProperties.letterboxingPercentage = props.letterboxingPercentage;
  }

  const hasAnyBoundSideSet =
    props.boundLeft !== undefined ||
    props.boundRight !== undefined ||
    props.boundTop !== undefined ||
    props.boundBottom !== undefined;
  const defaultBound = !hasAnyBoundSideSet;

  if (cameraProperties.bounds !== undefined) {
    if (!(props.boundLeft ?? defaultBound)) {
      cameraProperties.bounds.min.x = -Infinity;
    }
    if (!(props.boundBottom ?? defaultBound)) {
      cameraProperties.bounds.min.y = -Infinity;
    }
    if (!(props.boundRight ?? defaultBound)) {
      cameraProperties.bounds.max.x = Infinity;
    }
    if (!(props.boundTop ?? defaultBound)) {
      cameraProperties.bounds.max.y = Infinity;
    }
  }

  return cameraProperties;
}

export function buildAdjustmentCameraRequest(
  requestId: string,
  props: CameraRequestTiledProps,
  cameraProperties: Partial<CameraProperties>
): CameraRequest {
  return {
    id: requestId,
    priority: CameraRequestPriority.ADJUSTMENT,
    subPriority: props.priority ?? 0,
    influence: props.startActivated ?? false ? 1 : 0,
    mode: CameraRequestCombinationMode.EXPAND_IN_SAME_PRIORITY,
    ...cameraProperties
  };
}
