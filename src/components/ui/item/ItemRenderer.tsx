import cx from "classnames";
import { debounce } from "debounce";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Box2,
  Box3,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector2
} from "three";

import { ItemData } from "src/api/item";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import {
  expandCameraToSceneBBox,
  sizeCameraToCanvas
} from "src/components/viewport/util";
import { CameraDirector } from "src/engine/camera/CameraDirector";
import {
  SimpleRenderingContext,
  kSecondaryRenderer
} from "src/engine/rendering/CentralRenderer";
import { SizeAttributes } from "src/engine/util/vecTypes";
import { allItemDefinitionsByType } from "src/items/allItems";
import { SpellDefinition } from "src/items/spells/spell";

import "./ItemRenderer.less";

export type Object3DRendererProps = {
  object3D: Object3D;
  className?: string;
  renderEmitter?: TypedEventEmitter<{
    render: void;
  }>;
};

type Object3DRendererIState = {
  renderingContext?: SimpleRenderingContext;
  camera?: OrthographicCamera;
  scene?: Scene;
  canvasSize?: SizeAttributes;
  currentRenderedObject?: Object3D;
  onResize?: (size: SizeAttributes, forceRerender?: boolean) => void;
  onResizeDebounced?: (size: SizeAttributes, forceRerender?: boolean) => void;
};

export function Object3DRenderer(props: Object3DRendererProps) {
  const { object3D, className, renderEmitter } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iStateRef = useRef<Object3DRendererIState>({});
  const [containerRef, size] = useMeasureSize<HTMLDivElement>();

  useLayoutEffect(() => {
    const iState = iStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new Scene();
    iState.scene = scene;

    const camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, -1);
    iState.camera = camera;

    iState.renderingContext = new SimpleRenderingContext(
      kSecondaryRenderer,
      canvas
    );
    iState.renderingContext.clearAlpha = 0;

    const onResize = (
      containerRect: SizeAttributes,
      forceRerender?: boolean
    ) => {
      if (!iState.renderingContext) return;
      const { width, height } = containerRect;
      iState.canvasSize = { width, height };
      if (
        iState.renderingContext.resizeCanvas(
          width,
          height,
          window.devicePixelRatio
        ) ||
        forceRerender
      ) {
        iState.renderingContext.render(scene, camera);
      }
    };
    iState.onResize = onResize;
    iState.onResizeDebounced = debounce(onResize, 100);
    return () => {
      iState.renderingContext = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    const iState = iStateRef.current;
    const {
      camera,
      scene,
      onResize,
      onResizeDebounced,
      renderingContext,
      currentRenderedObject
    } = iState;
    if (
      !camera ||
      !scene ||
      !onResize ||
      !onResizeDebounced ||
      !renderingContext
    )
      return () => {};

    scene.add(object3D);

    // Size camera to fully encompass the object we're rendering.
    const bbox3 = new Box3();
    bbox3.expandByObject(object3D);
    const bbox2 = new Box2();
    bbox2.min.x = bbox3.min.x;
    bbox2.min.y = bbox3.min.y;
    bbox2.max.x = bbox3.max.x;
    bbox2.max.y = bbox3.max.y;
    const bboxSize2 = new Vector2();
    const bboxCenter2 = new Vector2();
    bbox2.getSize(bboxSize2);
    bbox2.getCenter(bboxCenter2);

    const cameraAPI = new CameraDirector();
    cameraAPI.setDefaultProperties({
      size: bboxSize2,
      center: bboxCenter2,
      bounds: bbox2
    });

    const cameraProperties = cameraAPI.resolveRequests();

    iState.canvasSize = { width: size.width, height: size.height };
    sizeCameraToCanvas(cameraProperties, size);
    expandCameraToSceneBBox(cameraProperties);
    const camSize =
      cameraProperties.size.clone().multiplyScalar(1.2) ?? bboxSize2;
    camera.position.x = cameraProperties.center?.x ?? 0;
    camera.position.y = cameraProperties.center?.y ?? 0;
    camera.left = -camSize.x * 0.5;
    camera.right = camSize.x * 0.5;
    camera.top = camSize.y * 0.5;
    camera.bottom = -camSize.y * 0.5;
    camera.updateProjectionMatrix();

    if (currentRenderedObject === object3D) {
      onResizeDebounced(size, true);
    } else {
      onResize(size, true);
    }

    const doRefresh = () => onResize(size, true);
    renderEmitter?.on("render", doRefresh);

    return () => {
      renderEmitter?.off("render", doRefresh);
      scene.remove(object3D);
    };
  }, [object3D, size, renderEmitter]);

  return (
    <div
      ref={containerRef}
      className={cx("object3D-renderer-container", className)}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export type ItemRendererProps = {
  item?: ItemData | null;
  className?: string;
};

export function ItemRenderer(props: ItemRendererProps) {
  const { item, className } = props;

  const renderEmitter = useMemo(
    () => createTypedEventEmitter<{ render: void }>(),
    []
  );

  const itemRenderInstance = useMemo(() => {
    if (!item) return null;
    switch (item.type) {
      case "spell":
        return SpellDefinition.getRenderInstance(item);
      default:
        return (
          allItemDefinitionsByType[item.type]?.getRenderInstance(item) || null
        );
    }
  }, [item]);
  useEffect(() => {
    return () => {
      itemRenderInstance?.dispose?.();
    };
  }, [itemRenderInstance]);

  useEffect(() => {
    let currentFrameRequest:
      | ReturnType<typeof requestAnimationFrame>
      | undefined;
    let earlier = performance.now();
    const doRender = () => {
      const now = performance.now();
      currentFrameRequest = requestAnimationFrame(doRender);
      const ms = now - earlier;
      earlier = now;
      itemRenderInstance?.animate?.(ms);
      renderEmitter.emit("render");
    };
    currentFrameRequest = requestAnimationFrame(doRender);
    return () => {
      if (currentFrameRequest !== undefined)
        cancelAnimationFrame(currentFrameRequest);
    };
  }, [renderEmitter, itemRenderInstance]);

  if (!itemRenderInstance) return null;
  return (
    <Object3DRenderer
      object3D={itemRenderInstance.object3D}
      renderEmitter={renderEmitter}
      className={className}
    />
  );
}
