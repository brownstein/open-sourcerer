import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from "@mui/material";
import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { Color, OrthographicCamera, Vector2, Vector3 } from "three";

import {
  CharacterColorizeLayer,
  CharacterGender
} from "src/api/characterCustomization";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import {
  kPixelScale,
  roundFractionalPixels
} from "src/engine/constants/scaling";
import { ViewportRenderingContext } from "src/engine/rendering/CentralRenderer";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectCharacterCustomization } from "src/redux/status/selectors";
import { setCharacterCustomization } from "src/redux/status/slice";

import { VisualizerController } from "../dev/EntityVisualizer";
import { ColorPicker } from "../ui/color/ColorPicker";
import {
  constrainCameraToSceneBBox,
  sizeCameraToCanvas
} from "../viewport/util";
import "./CharacterCustomization.less";

export type CharacterCustomizationProps = {};

export function CharacterCustomization(props: CharacterCustomizationProps) {
  const dispatch = useAppDispatch();
  const currentCustomization = useAppSelector(selectCharacterCustomization);

  const [containerRef, containerRect] = useMeasureSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iState = useRef<{
    controller?: VisualizerController;
    viewportRenderingContext?: ViewportRenderingContext;
    camera?: OrthographicCamera;
  }>({});
  const [levelReady, setLevelReady] = useState(false);
  const [needsResize, setNeedsResize] = useState(false);

  useEffect(() => {
    const iStateCurrent = iState.current;
    const controller = new VisualizerController({
      level: "Customizer"
    });

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
          clearAlpha: 0,
          clearColor: new Color(11 / 256, 12 / 256, 15 / 256)
        }
      );
      iStateCurrent.viewportRenderingContext.clearAlpha = 0;
      controller.level.cameraDirector.setDefaultProperties({
        size: new Vector2(10, 10),
        center: new Vector2()
      });

      setNeedsResize(true);
      setLevelReady(true);
    };

    if (controller.loadProgress === 1) {
      onControllerLevelReady();
    } else {
      controller.events.once("levelReady", onControllerLevelReady);
    }

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
        worldSize.x * kPixelScale * 2,
        worldSize.y * kPixelScale * 2
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
    controller?.events.on("frame", onFrame);
    return () => {
      controller?.events.off("frame", onFrame);
    };
  }, [needsResize, containerRect]);

  useEffect(() => {
    const { controller } = iState.current;
    if (!controller || !levelReady) return;
    controller.spawnEntity("Player", {
      disableCamera: true,
      // The preview is what the player is choosing between — it must show the
      // real colors even while the in-game character is a white silhouette.
      ignoreRenderMode: true
    });
  }, [levelReady]);

  const setColor = (
    colorAttr: CharacterColorizeLayer,
    value?: string,
    opacity?: number
  ) =>
    dispatch(
      setCharacterCustomization({
        ...currentCustomization,
        colors: {
          ...currentCustomization?.colors,
          [colorAttr]: {
            color: value ?? currentCustomization?.colors?.[colorAttr]?.color,
            opacity:
              opacity ?? currentCustomization?.colors?.[colorAttr]?.opacity
          }
        }
      })
    );

  return (
    <div
      className="character-customization"
      data-testid="character-customization"
      ref={containerRef}
    >
      <h3>Customize Your Character</h3>
      <div className="main-row">
        <div className="visualizer-canvas-container">
          <canvas ref={canvasRef} className={cx("visualizer-canvas")} />
        </div>
        <div className="character-props">
          <div className="prop name-prop">
            <div className="prop-name">Name</div>
            <TextField
              size="small"
              placeholder="Protag"
              value={currentCustomization.name ?? ""}
              onChange={(e) =>
                dispatch(
                  setCharacterCustomization({
                    ...currentCustomization,
                    name: e.target.value
                  })
                )
              }
            />
          </div>
          <div className="prop">
            <div className="prop-name">Gender</div>
            <FormControl size="small">
              <Select
                value={currentCustomization.gender ?? "male"}
                onChange={(e) =>
                  dispatch(
                    setCharacterCustomization({
                      ...currentCustomization,
                      gender: e.target.value as CharacterGender
                    })
                  )
                }
              >
                <MenuItem value="male">Male</MenuItem>
                <MenuItem value="female">Female</MenuItem>
              </Select>
            </FormControl>
          </div>
          <div className="prop">
            <div className="prop-name">Shirt Color</div>
            <ColorPicker
              value={currentCustomization.colors?.shirt?.color ?? "#ffffff"}
              alpha={currentCustomization.colors?.shirt?.opacity}
              onChange={(v) => setColor("shirt", v)}
              onChangeAlpha={(v) => setColor("shirt", undefined, v)}
              showAlpha
            />
          </div>
          <div className="prop">
            <div className="prop-name">Pants Color</div>
            <ColorPicker
              value={currentCustomization.colors?.pants?.color ?? "#ffffff"}
              alpha={currentCustomization.colors?.pants?.opacity}
              onChange={(v) => setColor("pants", v)}
              onChangeAlpha={(v) => setColor("pants", undefined, v)}
              showAlpha
            />
          </div>
          <div className="prop">
            <div className="prop-name">Fur Color</div>
            <div className="row">
              <ColorPicker
                value={currentCustomization.colors?.fur?.color ?? "#ffffff"}
                alpha={currentCustomization.colors?.fur?.opacity}
                onChange={(v) => setColor("fur", v)}
                onChangeAlpha={(v) => setColor("fur", undefined, v)}
                showAlpha
              />
              <ColorPicker
                value={currentCustomization.colors?.fur_2?.color ?? "#ffffff"}
                alpha={currentCustomization.colors?.fur_2?.opacity}
                onChange={(v) => setColor("fur_2", v)}
                onChangeAlpha={(v) => setColor("fur_2", undefined, v)}
                showAlpha
              />
            </div>
          </div>
          <div className="prop">
            <div className="prop-name">Hair Color</div>
            <ColorPicker
              value={currentCustomization.colors?.hair?.color ?? "#ffffff"}
              alpha={currentCustomization.colors?.hair?.opacity}
              onChange={(v) => setColor("hair", v)}
              onChangeAlpha={(v) => setColor("hair", undefined, v)}
              showAlpha
            />
          </div>
          <div className="prop">
            <div className="prop-name">Eye Color</div>
            <ColorPicker
              value={currentCustomization.colors?.eyes?.color ?? "#ffffff"}
              alpha={currentCustomization.colors?.eyes?.opacity}
              onChange={(v) => setColor("eyes", v)}
              onChangeAlpha={(v) => setColor("eyes", undefined, v)}
              showAlpha
            />
          </div>
        </div>
      </div>
    </div>
  );
}
