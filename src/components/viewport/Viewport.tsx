import confetti from "canvas-confetti";
import cx from "classnames";
import { debounce } from "debounce";
import {
  MouseEventHandler,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { ToastContainer, toast } from "react-fox-toast";
import { useTranslation } from "react-i18next";
import { Color, OrthographicCamera, Scene, Vector2, Vector3 } from "three";

import { ControlEvents } from "src/api/controls";
import { EntityLevelEvents } from "src/api/entity";
import { OverlayPosition } from "src/api/overlay";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { OverlayRenderer } from "src/components/ui/overlays/OverlayRenderer";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { DeathScreen } from "src/components/viewport/overlays/DeathScreen";
import { StatusOverlay } from "src/components/viewport/overlays/StatusOverlay";
import {
  constrainCameraToSceneBBox,
  sizeCameraToCanvas
} from "src/components/viewport/util";
import {
  kPixelScale,
  roundFractionalPixels
} from "src/engine/constants/scaling";
import { GameControllerEvents } from "src/engine/controller/GameControllerAPI";
import { ViewportRenderingContext } from "src/engine/rendering/CentralRenderer";
import { SizeAttributes, vector3To2 } from "src/engine/util/vecTypes";
import { MatchHUD } from "src/multiplayer/ui/MatchHUD";
import { ResultsScreen } from "src/multiplayer/ui/screens/ResultsScreen";
import {
  CurrencyDefinition,
  getCurrencyValueVariant
} from "src/items/currencies/Currency";
import { selectGamePaused } from "src/redux/gameState/selectors";
import { useAppStore } from "src/redux/hooks";
import { typeVariantName } from "src/redux/inventory/slice";
import {
  NotificationEvents,
  NotificationType,
  notificationEvents
} from "src/redux/shared/events";

import { ItemRenderer } from "../ui/item/ItemRenderer";
import "./Viewport.less";
import { FocusLostIndicator } from "./overlays/FocusLostIndicator";
import { LoadingScreenOverlay } from "./overlays/LoadingScreen";
import { PauseScreen } from "./overlays/PauseScreen";
import { ViewportBottomBarOverlay } from "./overlays/ViewportBottomBarOverlay";

type ViewportIState = {
  renderingContext?: ViewportRenderingContext;
  camera?: OrthographicCamera;
  nextCamera?: OrthographicCamera;
  canvasSize?: SizeAttributes;
  lastCursorScreenPosition?: Vector3;
  onResize?: (size: SizeAttributes) => void;
  onResizeDebounced?: (size: SizeAttributes) => void;
};

export function Viewport() {
  const controller = useContext(GameControllerContext);
  const store = useAppStore();
  const { t } = useTranslation();
  const iStateRef = useRef<ViewportIState>({});
  const [containerRef, containerRect] = useMeasureSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focused, setFocused] = useState(
    !!controller?.level?.controls?.cursorActive
  );
  const [cursorOverrides, setCursorOverrides] = useState<string[]>([]);
  const mouseDownRef = useRef(false);
  // Surfaces a fatal rendering-context failure to the error boundary once the
  // in-effect retries are exhausted, so the user gets the "Retry" recovery path
  // (which remounts with a fresh canvas).
  const [initError, setInitError] = useState<unknown>(null);

  // Set up main render loop, resize handler.
  useLayoutEffect(() => {
    const iState = iStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !controller) return;

    const emptyScene = new Scene();
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, -1);
    iState.camera = camera;
    const nextCamera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    nextCamera.position.set(0, 0, 64);
    nextCamera.lookAt(0, 0, -1);
    iState.nextCamera = nextCamera;

    const onMouseMove = (e: MouseEvent) => {
      const canvasRect = canvas.getBoundingClientRect();
      const cursorScreenPosition = new Vector3(
        (2 * (e.clientX - canvasRect.x)) / canvasRect.width - 1,
        1 - (2 * (e.clientY - canvasRect.y)) / canvasRect.height,
        0
      );
      iState.lastCursorScreenPosition = cursorScreenPosition;
    };

    let rightMouseDownRef = false;

    const onMouseDown = (e: MouseEvent) => {
      if (selectGamePaused(store.getState())) return;
      const { level, nextLevel } = controller;
      const selectedLevel = nextLevel ?? level;
      if (e.button === 2) {
        rightMouseDownRef = true;
        selectedLevel?.controls?.events.emit(ControlEvents.SecondaryAttack);
        selectedLevel?.controls?.events.emit(ControlEvents.RightMouseDown);
        return;
      }
      mouseDownRef.current = true;
      selectedLevel?.controls?.events.emit(ControlEvents.Click);
      selectedLevel?.controls?.events.emit(ControlEvents.LeftMouseDown);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        if (!rightMouseDownRef) return;
        rightMouseDownRef = false;
        if (selectGamePaused(store.getState())) return;
        const { level, nextLevel } = controller;
        const selectedLevel = nextLevel ?? level;
        selectedLevel?.controls?.events.emit(ControlEvents.RightMouseUp);
        return;
      }
      if (!mouseDownRef.current) return;
      mouseDownRef.current = false;
      if (selectGamePaused(store.getState())) return;
      const { level, nextLevel } = controller;
      const selectedLevel = nextLevel ?? level;
      selectedLevel?.controls?.events.emit(ControlEvents.LeftMouseUp);
    };

    const onCameraSizeFrame = () => {
      const { level, nextLevel } = controller;

      if (iState.lastCursorScreenPosition) {
        const selectedLevel = nextLevel ?? level;
        const selectedCamera = nextLevel ? nextCamera : camera;

        if (selectedCamera && selectedLevel) {
          const cursorScreenPosition = iState.lastCursorScreenPosition.clone();
          selectedLevel.controls?.setCursorScreenPosition(
            vector3To2(cursorScreenPosition)
          );
          cursorScreenPosition.unproject(selectedCamera);
          const sceenPosition = new Vector2(
            cursorScreenPosition.x,
            cursorScreenPosition.y
          );
          selectedLevel.controls?.setCursorScenePosition(sceenPosition);
        }
      }

      if (
        !iState.canvasSize ||
        iState.canvasSize.width <= 0 ||
        iState.canvasSize.height <= 0
      )
        return;

      const levelToResizeCameraTo = nextLevel ?? level;
      const cameraToResize = nextLevel ? nextCamera : camera;

      if (levelToResizeCameraTo) {
        const levelCamera = levelToResizeCameraTo.cameraDirector;
        levelCamera.attachViewportCamera(camera);

        const cameraProperties = levelCamera.resolveRequests();

        sizeCameraToCanvas(cameraProperties, iState.canvasSize);
        constrainCameraToSceneBBox(cameraProperties);

        const cameraCenter = cameraProperties.center;
        const cameraSize = cameraProperties.size;
        const cameraRotation = cameraProperties.rotation;

        cameraToResize.position.x = roundFractionalPixels(cameraCenter.x);
        cameraToResize.position.y = roundFractionalPixels(cameraCenter.y);
        cameraToResize.left = roundFractionalPixels(-cameraSize.x * 0.5);
        cameraToResize.right = roundFractionalPixels(cameraSize.x * 0.5);
        cameraToResize.top = roundFractionalPixels(cameraSize.y * 0.5);
        cameraToResize.bottom = roundFractionalPixels(-cameraSize.y * 0.5);
        cameraToResize.rotation.z = cameraRotation;
        cameraToResize.updateProjectionMatrix();
      }

      let sceneWidthPx = Math.min(
        iState.canvasSize.width,
        Math.ceil(cameraToResize.right - cameraToResize.left) * kPixelScale * 2
      );
      let sceneHeightPx = Math.min(
        iState.canvasSize.height,
        Math.ceil(cameraToResize.top - cameraToResize.bottom) * kPixelScale * 2
      );

      iState.renderingContext?.resizeCamera(sceneWidthPx, sceneHeightPx);
    };

    const onFrame = () => {
      const { level, nextLevel, levelTransitionProgress } = controller;

      if (iState.renderingContext) {
        if (level?.backgroundColor || nextLevel?.backgroundColor) {
          const currentBgColor = level?.backgroundColor ?? new Color(0x112233);
          const nextBgColor = nextLevel?.backgroundColor;
          if (nextBgColor && levelTransitionProgress !== undefined) {
            const lerpedColor = currentBgColor
              .clone()
              .lerp(nextBgColor, levelTransitionProgress);
            iState.renderingContext.clearColor = lerpedColor;
          } else {
            iState.renderingContext.clearColor = currentBgColor;
          }
        }

        const cameraProperties = level?.cameraDirector.getCurrentProperties();
        if (cameraProperties) {
          iState.renderingContext.setDistort(cameraProperties.distort);
          iState.renderingContext.setCompositeOpacity(
            cameraProperties.compositeOpacity
          );
          iState.renderingContext.setLetterboxing(
            cameraProperties.letterboxingPercentage
          );
        }

        iState.renderingContext.render(
          level?.scene ?? emptyScene,
          camera,
          nextLevel?.scene,
          nextCamera,
          levelTransitionProgress
        );
      }
    };

    const updateCursorOverrides = () => {
      const { level } = controller;
      if (!level) {
        setCursorOverrides([]);
        return;
      }
      const cursorOverrideSet = new Set<string>();
      for (const entity of level.getEntities().values()) {
        const entityCursorOverrides = entity.cursorOverrides?.();
        if (entityCursorOverrides) {
          for (const override of entityCursorOverrides)
            cursorOverrideSet.add(override);
        }
      }
      setCursorOverrides([...cursorOverrideSet.values()]);
    };

    const onLevelTransition = () => {
      const { level } = controller;
      // It's OK that this dangles because the level will be disposed of.
      level?.on(EntityLevelEvents.UpdateCursorOverrides, updateCursorOverrides);
      updateCursorOverrides();
    };

    controller.events.on(GameControllerEvents.CameraSizing, onCameraSizeFrame);
    controller.events.on(GameControllerEvents.RenderFrame, onFrame);
    controller.events.on(
      GameControllerEvents.TransitionToLevelComplete,
      onLevelTransition
    );

    const onResize = (containerRect: SizeAttributes) => {
      const { width, height } = containerRect;
      iState.canvasSize = { width, height };
      if (
        iState.renderingContext?.resizeCanvas(
          width,
          height,
          window.devicePixelRatio
        )
      ) {
        onCameraSizeFrame();
        controller.level?.emit(EntityLevelEvents.OutOfSyncCameraUpdate);
        onFrame();
      }
    };
    iState.onResize = onResize;
    iState.onResizeDebounced = debounce(onResize, 45);

    // Constructing the WebGL rendering context can throw transiently when the
    // GPU process is under pressure or the browser's per-page WebGL context cap
    // is hit. Letting that throw escape this effect unmounts the whole viewport
    // via the error boundary ("Error rendering component"). Instead, attempt
    // construction defensively and retry until a context is available so the
    // viewport recovers on its own (e.g. once leaked contexts free up).
    let initRetryTimer: ReturnType<typeof setTimeout> | undefined;
    let initAttempts = 0;
    const kMaxInitAttempts = 20; // ~10s of retries at 500ms
    const initRenderingContext = () => {
      try {
        iState.renderingContext = new ViewportRenderingContext(canvas);
      } catch (err) {
        initAttempts++;
        // Log once to avoid flooding the console while retrying every 500ms.
        if (initAttempts === 1)
          console.warn(
            "Viewport: failed to create WebGL rendering context; retrying.",
            err
          );
        if (initAttempts >= kMaxInitAttempts) {
          console.error(
            `Viewport: gave up creating WebGL rendering context after ${initAttempts} attempts.`
          );
          // Hand off to the error boundary so the user can retry with a fresh
          // canvas (the existing canvas may hold a poisoned context).
          setInitError(err);
          return;
        }
        initRetryTimer = setTimeout(initRenderingContext, 500);
        return;
      }
      // Kick off initial sizing/render now that the context exists.
      onResize(canvas.getBoundingClientRect());
      onCameraSizeFrame();
      onFrame();
    };
    initRenderingContext();

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    return () => {
      if (initRetryTimer !== undefined) clearTimeout(initRetryTimer);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      controller.events.off(
        GameControllerEvents.CameraSizing,
        onCameraSizeFrame
      );
      controller.events.off(GameControllerEvents.RenderFrame, onFrame);
      controller.events.off(
        GameControllerEvents.TransitionToLevelComplete,
        onLevelTransition
      );
      iState.renderingContext?.dispose();
      iState.renderingContext = undefined;
      iState.onResize = undefined;
      iState.onResizeDebounced = undefined;
    };
  }, [controller, store]);

  // Apply container rect when it changes.
  useLayoutEffect(() => {
    iStateRef.current.canvasSize = containerRect;
    iStateRef.current.onResizeDebounced?.(containerRect);
  }, [containerRect]);

  // Track whether or not the viewport has active focus.
  useEffect(() => {
    const onContextActive = ([_activeContextId, isViewport]: [
      string,
      boolean
    ]) => {
      setFocused(isViewport);
    };
    controller?.controls.events.on(
      ControlEvents.SetActiveContext,
      onContextActive
    );
    return () => {
      controller?.controls.events.off(
        ControlEvents.SetActiveContext,
        onContextActive
      );
    };
  }, [controller]);

  // Bind notification events.
  useEffect(() => {
    const notify = (note: NotificationType) => {
      if (note.type === "item") {
        let translatedItemName = t(
          `items.${typeVariantName(note.itemType, note.itemVariant)}`.replaceAll(
            ":",
            "__"
          ),
          t("items.Default")
        );
        if (note.itemName)
          translatedItemName = `${translatedItemName}: ${note.itemName}`;
        toast.custom(
          <div>
            {t("toast.gotItem", {
              count: note.count ?? 1,
              itemName: translatedItemName
            })}
          </div>,
          {
            className: "viewport-item-toast",
            icon: (
              <div className="viewport-item-toast-icon">
                <ItemRenderer
                  item={{
                    type: note.itemType,
                    variant: note.itemVariant
                  }}
                />
              </div>
            )
          }
        );
      }
      if (note.type === "currency") {
        toast.custom(
          <div>
            {t("toast.gotCurrency", {
              count: note.count
            })}
          </div>,
          {
            className: "viewport-item-toast",
            icon: (
              <div className="viewport-item-toast-icon">
                <ItemRenderer
                  item={{
                    type: CurrencyDefinition.type,
                    variant: getCurrencyValueVariant(note.count)
                  }}
                />
              </div>
            )
          }
        );
      }
      if (note.type === "challenge") {
        toast.custom(<div>Challenge complete - you did it!</div>, {
          className: "viewport-challenge-toast"
        });
        confetti();
      }
    };
    notificationEvents.on(NotificationEvents.Notify, notify);
    return () => {
      notificationEvents.off(NotificationEvents.Notify, notify);
    };
  }, [t]);

  // Capture right clicks.
  const onContextMenu = useCallback<MouseEventHandler>((e) => {
    e.preventDefault();
  }, []);

  // If the rendering context could not be created after retrying, escalate to
  // the error boundary (renders its fallback with a Retry button).
  if (initError) throw initError;

  return (
    <div
      className="viewport-renderer"
      ref={containerRef}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        className={cx(
          "viewport-canvas viewport-canvas-background",
          cursorOverrides
        )}
      />
      <ToastContainer position="bottom-right" />
      <StatusOverlay
        containerWidth={containerRect.width}
        containerHeight={containerRect.height}
        viewportFocused={focused}
      />
      <ViewportBottomBarOverlay />
      <FocusLostIndicator />
      <PauseScreen />
      <DeathScreen />
      <MatchHUD />
      <ResultsScreen />
      <LoadingScreenOverlay />
      <OverlayRenderer position={OverlayPosition.Viewport} />
    </div>
  );
}
