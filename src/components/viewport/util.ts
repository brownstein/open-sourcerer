import { Vector2 } from "three";

import { CameraProperties } from "src/api/camera";
import { SizeAttributes } from "src/engine/util/vecTypes";

export function sizeCameraToCanvas(
  camera: CameraProperties,
  canvasSize: SizeAttributes
) {
  const currentCamAspectRatio = camera.size.x / (camera.size.y || 1);
  const canvasAspectRatio = canvasSize.width / (canvasSize.height || 1);
  const canvasCamAspectRatioRatio = canvasAspectRatio / currentCamAspectRatio;
  camera.size.x *= 1 + 0.5 * (canvasCamAspectRatioRatio - 1);
  camera.size.y *= 1 + 0.5 * (1 / canvasCamAspectRatioRatio - 1);
}

export function constrainCameraToSceneBBox(camera: CameraProperties) {
  const bbox = camera.bounds;

  // Get world size.
  const worldSize = new Vector2();
  bbox.getSize(worldSize);

  // Constrain dimensions of the camera to world size.
  const widthContstrined = worldSize.x < camera.size.x;
  if (widthContstrined) camera.size.multiplyScalar(worldSize.x / camera.size.x);
  const heightConstrained = worldSize.y < camera.size.y;
  if (heightConstrained)
    camera.size.multiplyScalar(worldSize.y / camera.size.y);

  // Calculate initial bounds.
  let topBound = camera.center.y + camera.size.y * 0.5;
  let bottomBound = camera.center.y - camera.size.y * 0.5;
  let leftBound = camera.center.x - camera.size.x * 0.5;
  let rightBound = camera.center.x + camera.size.x * 0.5;

  // Push camera around based on world boundaries.
  const camCenterDelta2 = new Vector2();
  if (topBound > bbox.max.y) {
    camCenterDelta2.y -= topBound - bbox.max.y;
  }
  if (bottomBound < bbox.min.y) {
    camCenterDelta2.y -= bottomBound - bbox.min.y;
  }
  if (leftBound < bbox.min.x) {
    camCenterDelta2.x -= leftBound - bbox.min.x;
  }
  if (rightBound > bbox.max.x) {
    camCenterDelta2.x -= rightBound - bbox.max.x;
  }

  // Apply the delta.
  camera.center.add(camCenterDelta2);
}

export function expandCameraToSceneBBox(camera: CameraProperties) {
  const bbox = camera.bounds;

  // Get world size.
  const worldSize = new Vector2();
  bbox.getSize(worldSize);

  // Let's avoid dividing by 0.
  if (worldSize.x === 0 || camera.size.x === 0) return;

  const xScaleFactor = worldSize.x / camera.size.x;
  const yScaleFactor = worldSize.y / camera.size.y;
  const maxScaleFactor = Math.max(xScaleFactor, yScaleFactor);

  camera.size.x = camera.size.x * maxScaleFactor;
  camera.size.y = camera.size.y * maxScaleFactor;
}
