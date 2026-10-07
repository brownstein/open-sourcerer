import {
  FormControl,
  MenuItem,
  Button as MuiButton,
  Select
} from "@mui/material";
import cx from "classnames";
import {
  ComponentType,
  MouseEventHandler,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { IAceEditorProps } from "react-ace";
import { useMeasure } from "react-use";
import { Color, OrthographicCamera, Vector2, Vector3 } from "three";

import { ControlEvents } from "src/api/controls";
import {
  SpellCtx,
  SpellCtxConsoleLogLine,
  SpellCtxEvents
} from "src/api/spells";
import { Icon } from "src/components/ui/icons/Icon";
import {
  kPixelScale,
  roundFractionalPixels
} from "src/engine/constants/scaling";
import { ViewportRenderingContext } from "src/engine/rendering/CentralRenderer";
import { vector3To2 } from "src/engine/util/vecTypes";
import { builtInSpells } from "src/scripting/builtinScripts/index";

import {
  constrainCameraToSceneBBox,
  sizeCameraToCanvas
} from "../viewport/util";
import "./SpellTester.less";
import { CasterType, SpellTesterController } from "./SpellTesterController";
import { BuiltInScriptId } from "src/scripting/builtinScripts/keys";

const AceEditorShim = lazy(() => import("../editor/AceShim"));
const AceEditor = AceEditorShim as ComponentType<IAceEditorProps>;

function formatConsoleLine(line: SpellCtxConsoleLogLine): string {
  if (line.primitiveValue !== undefined && line.primitiveValue !== null) {
    return String(line.primitiveValue);
  }
  if (line.objectValue !== undefined) {
    try {
      return JSON.stringify(line.objectValue, null, 2);
    } catch {
      return String(line.objectValue);
    }
  }
  return "";
}

export function SpellTester() {
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  const iState = useRef<{
    controller?: SpellTesterController;
    viewportRenderingContext?: ViewportRenderingContext;
    camera?: OrthographicCamera;
    lastCursorScreenPosition?: Vector3;
  }>({});

  const [levelReady, setLevelReady] = useState(false);
  const [needsResize, setNeedsResize] = useState(false);
  const [code, setCode] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [running, setRunning] = useState(false);
  const [autoRerun, setAutoRerun] = useState(false);
  const [casterType, setCasterType] = useState<CasterType>("ManaSpark");
  const [mana, setMana] = useState<number | null>(null);
  const [consoleLines, setConsoleLines] = useState<
    { text: string; isError: boolean }[]
  >([]);
  const activeCtxRef = useRef<SpellCtx | null>(null);
  const runIdRef = useRef(0);

  // Initialize controller + wire up mouse input on the canvas
  useEffect(() => {
    const iStateCurrent = iState.current;
    const controller = new SpellTesterController();
    iStateCurrent.controller = controller;

    iStateCurrent.camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    iStateCurrent.camera.up = new Vector3(0, 1, 0);
    iStateCurrent.camera.lookAt(new Vector3(0, 0, -1));

    const canvas = canvasRef.current;

    // --- Mouse input handlers (mirrors Viewport.tsx) ---
    const onMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      iStateCurrent.lastCursorScreenPosition = new Vector3(
        (2 * (e.clientX - canvasRect.x)) / canvasRect.width - 1,
        1 - (2 * (e.clientY - canvasRect.y)) / canvasRect.height,
        0
      );
    };

    const onMouseDown = () => {
      controller.controls.events.emit(ControlEvents.Click);
      controller.controls.events.emit(ControlEvents.LeftMouseDown);
    };

    const onMouseUp = () => {
      controller.controls.events.emit(ControlEvents.LeftMouseUp);
    };

    canvas?.addEventListener("mousemove", onMouseMove);
    canvas?.addEventListener("mousedown", onMouseDown);
    canvas?.addEventListener("mouseup", onMouseUp);

    const onLevelReady = () => {
      const rCanvas = canvasRef.current;
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
        size: new Vector2(20, 20),
        center: new Vector2()
      });
      setNeedsResize(true);
      setLevelReady(true);
    };

    controller.events.once("levelReady", onLevelReady);

    return () => {
      canvas?.removeEventListener("mousemove", onMouseMove);
      canvas?.removeEventListener("mousedown", onMouseDown);
      canvas?.removeEventListener("mouseup", onMouseUp);
      controller.destroy();
      iStateCurrent.controller = undefined;
    };
  }, []);

  // Keyboard input for player control (WASD / arrows + space)
  useEffect(() => {
    const controller = iState.current.controller;
    if (!controller) return;

    const activeActions = new Set<string>();

    const isEditorFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      return (
        el.tagName === "TEXTAREA" ||
        el.tagName === "INPUT" ||
        el.closest(".ace_editor") !== null
      );
    };

    const getHorizontalDelta = () => {
      let d = 0;
      if (activeActions.has("left")) d--;
      if (activeActions.has("right")) d++;
      return d;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditorFocused()) return;
      const key = e.key;

      if (key === "a" || key === "ArrowLeft") {
        if (activeActions.has("left")) return;
        activeActions.add("left");
        controller.controls.events.emit(
          ControlEvents.MoveHorizontally,
          getHorizontalDelta()
        );
        e.preventDefault();
      } else if (key === "d" || key === "ArrowRight") {
        if (activeActions.has("right")) return;
        activeActions.add("right");
        controller.controls.events.emit(
          ControlEvents.MoveHorizontally,
          getHorizontalDelta()
        );
        e.preventDefault();
      } else if (key === "w" || key === "ArrowUp") {
        controller.controls.events.emit(ControlEvents.MoveVertically, 1);
        e.preventDefault();
      } else if (key === "s" || key === "ArrowDown") {
        controller.controls.events.emit(ControlEvents.MoveVertically, -1);
        controller.controls.events.emit(ControlEvents.FallThrough);
        e.preventDefault();
      } else if (key === " ") {
        controller.controls.events.emit(ControlEvents.JumpStart);
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key;

      if (key === "a" || key === "ArrowLeft") {
        activeActions.delete("left");
        const delta = getHorizontalDelta();
        controller.controls.events.emit(ControlEvents.MoveHorizontally, delta);
        if (delta === 0) controller.controls.events.emit(ControlEvents.Stop);
      } else if (key === "d" || key === "ArrowRight") {
        activeActions.delete("right");
        const delta = getHorizontalDelta();
        controller.controls.events.emit(ControlEvents.MoveHorizontally, delta);
        if (delta === 0) controller.controls.events.emit(ControlEvents.Stop);
      } else if (key === "w" || key === "ArrowUp") {
        controller.controls.events.emit(ControlEvents.MoveVertically, 0);
      } else if (key === "s" || key === "ArrowDown") {
        controller.controls.events.emit(ControlEvents.FallThroughEnd);
        controller.controls.events.emit(ControlEvents.MoveVertically, 0);
      } else if (key === " ") {
        controller.controls.events.emit(ControlEvents.JumpRelease);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [levelReady]);

  // Render loop + cursor-to-world coordinate projection each frame
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
      worldBounds.getSize(worldSize);

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

      const cameraCenter = cameraProperties.center;
      const cameraSize = cameraProperties.size;
      const cameraRotation = cameraProperties.rotation;

      camera.position.x = roundFractionalPixels(cameraCenter.x);
      camera.position.y = roundFractionalPixels(cameraCenter.y);
      camera.position.z = 32;
      camera.left = roundFractionalPixels(-cameraSize.x * 0.5);
      camera.right = roundFractionalPixels(cameraSize.x * 0.5);
      camera.top = roundFractionalPixels(cameraSize.y * 0.5);
      camera.bottom = roundFractionalPixels(-cameraSize.y * 0.5);
      camera.rotation.z = cameraRotation;
      camera.updateProjectionMatrix();

      // Project cursor screen position → world position (mirrors Viewport)
      if (iStateCurrent.lastCursorScreenPosition) {
        const cursorScreen = iStateCurrent.lastCursorScreenPosition.clone();
        controller.controls.setCursorScreenPosition(vector3To2(cursorScreen));
        cursorScreen.unproject(camera);
        controller.controls.setCursorScenePosition(
          new Vector2(cursorScreen.x, cursorScreen.y)
        );
      }

      viewportRenderingContext.render(controller.level.scene, camera);

      // Update mana display
      setMana(controller.getMana());
    };

    setNeedsResize(false);
    onFrame();
    controller?.events.on("frame", onFrame);
    return () => {
      controller?.events.off("frame", onFrame);
    };
  }, [needsResize, containerRect]);

  // Auto-scroll console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  const onPresetChange = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    const preset = builtInSpells[presetId as BuiltInScriptId];
    if (preset) {
      setCode(preset.code);
    }
  }, []);

  const onCasterTypeChange = useCallback((type: string) => {
    setCasterType(type as CasterType);
    iState.current.controller?.setCasterType(type as CasterType);
  }, []);

  const onRun = useCallback(async () => {
    const { controller } = iState.current;
    if (!controller) return;

    // Increment run ID so stale listeners from previous runs are ignored
    const thisRunId = ++runIdRef.current;

    // Clear console
    setConsoleLines([]);
    setRunning(true);

    const ctx = await controller.runCode(code);
    if (!ctx || thisRunId !== runIdRef.current) {
      if (thisRunId === runIdRef.current) setRunning(false);
      return;
    }
    activeCtxRef.current = ctx;

    // Listen for console output
    const onConsoleLog = (line: SpellCtxConsoleLogLine) => {
      if (thisRunId !== runIdRef.current) return;
      setConsoleLines((prev) => [
        ...prev,
        { text: formatConsoleLine(line), isError: line.type === "error" }
      ]);
    };
    ctx.events.on(SpellCtxEvents.consoleLog, onConsoleLog);

    // Listen for errors
    const onError = (err: unknown) => {
      if (thisRunId !== runIdRef.current) return;
      const error = err as { message?: string };
      setConsoleLines((prev) => [
        ...prev,
        { text: `Error: ${error?.message ?? "Unknown error"}`, isError: true }
      ]);
      setRunning(false);
    };
    ctx.events.on(SpellCtxEvents.runError, onError);

    // Listen for completion
    const onComplete = () => {
      if (thisRunId !== runIdRef.current) return;
      setRunning(false);
    };
    ctx.events.on(SpellCtxEvents.runComplete, onComplete);
    ctx.events.on(SpellCtxEvents.runTerminated, onComplete);
  }, [code]);

  const onStop = useCallback(() => {
    iState.current.controller?.stopCode();
    setRunning(false);
  }, []);

  // Keep a ref to onRun so the interval always calls the latest version
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Auto-rerun loop
  useEffect(() => {
    if (!autoRerun || !levelReady) return;
    onRunRef.current();
    const interval = setInterval(() => {
      onRunRef.current();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRerun, levelReady]);

  const onToggleAutoRerun = useCallback(() => {
    setAutoRerun((prev) => {
      if (prev) {
        // Turning off — stop current spell
        iState.current.controller?.stopCode();
        setRunning(false);
      }
      return !prev;
    });
  }, []);

  const onBack = useCallback(() => {
    window.location.search = "";
  }, []);

  const onContextMenu = useCallback<MouseEventHandler>((e) => {
    e.preventDefault();
  }, []);

  return (
    <div className="spell-tester" ref={containerRef}>
      <div className="spell-tester-header">
        <h3>Spell Tester</h3>
        <MuiButton
          variant="text"
          size="small"
          className="spell-tester-back"
          onClick={onBack}
        >
          &larr; Back
        </MuiButton>
      </div>
      <div className="spell-tester-body">
        <div className="spell-tester-viewport" onContextMenu={onContextMenu}>
          <canvas ref={canvasRef} />
          {mana !== null && (
            <div className="spell-tester-mana">
              <div className="mana-label">Mana</div>
              <div className="mana-value">{Math.floor(mana)}</div>
            </div>
          )}
        </div>
        <div className="spell-tester-sidebar">
          <div className="spell-tester-controls">
            <FormControl size="small">
              <Select
                value={casterType}
                onChange={(e) => onCasterTypeChange(e.target.value)}
              >
                <MenuItem value="ManaSpark">ManaSpark</MenuItem>
                <MenuItem value="Player">Player</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <Select
                value={selectedPreset}
                onChange={(e) => onPresetChange(e.target.value)}
              >
                {Object.entries(builtInSpells).map(([key, spell]) => (
                  <MenuItem key={key} value={key}>
                    {spell.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <MuiButton
              variant="contained"
              size="small"
              className={cx("run-btn")}
              onClick={onRun}
              disabled={running || autoRerun || !levelReady}
            >
              <Icon icon="play" size="font" /> Run
            </MuiButton>
            {running && !autoRerun && (
              <MuiButton
                variant="contained"
                color="error"
                size="small"
                className={cx("stop-btn")}
                onClick={onStop}
              >
                <Icon icon="stop" size="font" /> Stop
              </MuiButton>
            )}
            <MuiButton
              variant={autoRerun ? "contained" : "outlined"}
              size="small"
              className={cx("loop-btn", { active: autoRerun })}
              onClick={onToggleAutoRerun}
              disabled={!levelReady}
            >
              <Icon icon="sync" size="font" /> Loop
            </MuiButton>
          </div>
          <div className="spell-tester-editor">
            <Suspense
              fallback={<div style={{ padding: "1em" }}>Loading editor...</div>}
            >
              <AceEditor
                value={code}
                onChange={setCode}
                width="100%"
                height="100%"
                fontSize={14}
                showPrintMargin={false}
                setOptions={{
                  useWorker: false,
                  tabSize: 2
                }}
              />
            </Suspense>
          </div>
          <div className="spell-tester-console">
            <div className="console-header">Console</div>
            <div className="console-output">
              {consoleLines.map((line, i) => (
                <div
                  key={i}
                  className={cx("console-line", {
                    "console-error": line.isError
                  })}
                >
                  {line.text}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpellTester;
