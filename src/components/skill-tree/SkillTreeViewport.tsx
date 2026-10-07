import cx from "classnames";
import { debounce } from "debounce";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMeasure } from "react-use";
import { Box2, Box3, OrthographicCamera, Vector2, Vector3 } from "three";

import { CameraProperties } from "src/api/camera";
import { EntityLevelEvents } from "src/api/entity";
import { preloadSpellIconImages } from "src/components/ui/spells/spellIconRenderer";
import {
  constrainCameraToSceneBBox,
  expandCameraToSceneBBox,
  sizeCameraToCanvas
} from "src/components/viewport/util";
import { roundFractionalPixels } from "src/engine/constants/scaling";
import { Level } from "src/engine/level/Level";
import { LevelLoader } from "src/engine/level/LevelLoader";
import { SkillTreeRenderingContext } from "src/engine/rendering/CentralRenderer";
import { SizeAttributes } from "src/engine/util/vecTypes";
import {
  SkillTreeConnection,
  SkillTreeNode
} from "src/entities/ui/SkillTreeContent";
import { SkillTreeLevel } from "src/levels/levels/dev/SkillTreeLevel";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { pushModalTyped } from "src/redux/shared/actions";
import { selectLearnedSkillsMap } from "src/redux/skillTree/selectors";
import { setSelectedNode } from "src/redux/skillTree/slice";

import "./SkillTreeViewport.less";

const BACKGROUND_COLOR = 0x0d0e13;
/** Padding (world units) added around the tree when framing the camera. */
const FRAME_PADDING = 1.5;
/** Tightest zoom-in (world units of the smaller camera axis). */
const MIN_VIEW_SIZE = 4;
/** A press that moves less than this (screen px) counts as a click, not a pan. */
const CLICK_MOVE_THRESHOLD = 4;

type IState = {
  renderingContext?: SkillTreeRenderingContext;
  camera?: OrthographicCamera;
  level?: Level;
  controller?: SkillTreeController;
  bounds: Box2;
  center: Vector2;
  size: Vector2;
  canvasSize: SizeAttributes;
  raf?: number;
  onResizeDebounced?: (size: SizeAttributes) => void;
};

/** Minimal CameraProperties used purely to drive the viewport camera helpers. */
function makeCameraProps(state: IState): CameraProperties {
  return {
    center: state.center,
    size: state.size,
    bounds: state.bounds,
    offset: new Vector2(),
    rotation: 0,
    distort: 0,
    compositeOpacity: 1,
    shake: 0,
    letterboxingPercentage: 0
  };
}

/** Writes the framed center/size onto the orthographic camera. */
function applyCamera(state: IState) {
  const { camera, center, size } = state;
  if (!camera) return;
  camera.position.x = roundFractionalPixels(center.x);
  camera.position.y = roundFractionalPixels(center.y);
  camera.left = roundFractionalPixels(-size.x * 0.5);
  camera.right = roundFractionalPixels(size.x * 0.5);
  camera.top = roundFractionalPixels(size.y * 0.5);
  camera.bottom = roundFractionalPixels(-size.y * 0.5);
  camera.updateProjectionMatrix();
}

/** Re-fits size to the canvas aspect and keeps the view inside scene bounds. */
function reframe(state: IState) {
  if (state.canvasSize.width <= 0 || state.canvasSize.height <= 0) return;
  const props = makeCameraProps(state);
  sizeCameraToCanvas(props, state.canvasSize);
  constrainCameraToSceneBBox(props);
  applyCamera(state);
}

/** Pan (left-drag), zoom (wheel), and hover/click hit-testing against nodes. */
class SkillTreeController {
  private dragging = false;
  private movedDuringPress = false;
  private pressScreen = new Vector2();
  private pressCenter = new Vector2();
  private hovered?: SkillTreeNode;

  private readonly onMove: (e: MouseEvent) => void;
  private readonly onDown: (e: MouseEvent) => void;
  private readonly onUp: (e: MouseEvent) => void;
  private readonly onWheelBound: (e: WheelEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: IState,
    private readonly level: Level,
    private readonly onHover: (node?: SkillTreeNode) => void,
    private readonly onActivate: (node: SkillTreeNode) => void
  ) {
    this.onMove = (e) => this.handleMove(e);
    this.onDown = (e) => this.handleDown(e);
    this.onUp = (e) => this.handleUp(e);
    this.onWheelBound = (e) => this.handleWheel(e);
    canvas.addEventListener("mousemove", this.onMove);
    canvas.addEventListener("mousedown", this.onDown);
    canvas.addEventListener("mouseup", this.onUp);
    canvas.addEventListener("mouseleave", this.onUp);
    canvas.addEventListener("wheel", this.onWheelBound, { passive: false });
  }

  dispose() {
    this.canvas.removeEventListener("mousemove", this.onMove);
    this.canvas.removeEventListener("mousedown", this.onDown);
    this.canvas.removeEventListener("mouseup", this.onUp);
    this.canvas.removeEventListener("mouseleave", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheelBound);
  }

  /** Cursor → normalized device coords. */
  private screenOf(e: MouseEvent): Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector3(
      (2 * (e.clientX - rect.x)) / rect.width - 1,
      1 - (2 * (e.clientY - rect.y)) / rect.height,
      0
    );
  }

  /** Cursor → world point via the orthographic camera. */
  private worldOf(e: MouseEvent): Vector2 {
    const camera = this.state.camera;
    if (!camera) return new Vector2();
    const w = this.screenOf(e).unproject(camera);
    return new Vector2(w.x, w.y);
  }

  private nodeAt(point: Vector2): SkillTreeNode | undefined {
    let hit: SkillTreeNode | undefined;
    let bestDistSq = Infinity;
    for (const entity of this.level.getEntities().values()) {
      if (entity.type !== SkillTreeNode.type) continue;
      const node = entity as SkillTreeNode;
      const dx = node.position.x - point.x;
      const dy = node.position.y - point.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= node.radius * node.radius && distSq < bestDistSq) {
        bestDistSq = distSq;
        hit = node;
      }
    }
    return hit;
  }

  private handleDown(e: MouseEvent) {
    if (e.button !== 0) return;
    this.dragging = true;
    this.movedDuringPress = false;
    this.pressScreen.set(e.clientX, e.clientY);
    this.pressCenter.copy(this.state.center);
  }

  private handleMove(e: MouseEvent) {
    if (this.dragging && e.buttons === 1) {
      if (
        this.pressScreen.distanceTo(new Vector2(e.clientX, e.clientY)) >
        CLICK_MOVE_THRESHOLD
      ) {
        this.movedDuringPress = true;
      }
      this.pan(e);
      return;
    }
    // Hover detection while not dragging.
    const node = this.nodeAt(this.worldOf(e));
    this.canvas.style.cursor = node ? "pointer" : "grab";
    if (node !== this.hovered) {
      this.hovered = node;
      this.onHover(node);
    }
  }

  private handleUp(e: MouseEvent) {
    if (this.dragging && !this.movedDuringPress) {
      const node = this.nodeAt(this.worldOf(e));
      if (node) this.onActivate(node);
    }
    this.dragging = false;
  }

  /** Drag the camera so the grabbed world point stays under the cursor. */
  private pan(e: MouseEvent) {
    const camera = this.state.camera;
    if (!camera) return;
    const rect = this.canvas.getBoundingClientRect();
    const grab = new Vector3(
      (2 * (this.pressScreen.x - rect.x)) / rect.width - 1,
      1 - (2 * (this.pressScreen.y - rect.y)) / rect.height,
      0
    ).unproject(camera);
    const now = this.screenOf(e).unproject(camera);
    this.state.center.set(
      this.pressCenter.x + (grab.x - now.x),
      this.pressCenter.y + (grab.y - now.y)
    );
    reframe(this.state);
  }

  /** Zoom toward the cursor, keeping its world point fixed. */
  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const camera = this.state.camera;
    if (!camera) return;
    const before = this.worldOf(e);

    const factor = Math.exp(e.deltaY * 0.001);
    const minAxis = Math.min(this.state.size.x, this.state.size.y);
    const clamped = Math.max(factor, MIN_VIEW_SIZE / Math.max(minAxis, 1e-6));
    this.state.size.multiplyScalar(clamped);
    reframe(this.state);

    const after = this.worldOf(e);
    this.state.center.add(before.sub(after));
    reframe(this.state);
  }
}

export function STViewport() {
  const dispatch = useAppDispatch();
  const learnedSkills = useAppSelector(selectLearnedSkillsMap);
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iStateRef = useRef<IState>({
    bounds: new Box2(),
    center: new Vector2(),
    size: new Vector2(1, 1),
    canvasSize: { width: 0, height: 0 }
  });
  const [loaded, setLoaded] = useState(false);

  // Load the skill-tree level standalone and drive a render loop.
  useLayoutEffect(() => {
    const iState = iStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, -1);
    iState.camera = camera;

    const renderingContext = new SkillTreeRenderingContext(canvas);
    renderingContext.clearColor = BACKGROUND_COLOR;
    iState.renderingContext = renderingContext;

    (async () => {
      // Spell-icon art must be ready before ability nodes build their icons.
      await preloadSpellIconImages();
      const level = await new LevelLoader("SkillTree")
        .setLevelDef(SkillTreeLevel)
        .load();
      if (cancelled) {
        level.dispose();
        return;
      }
      // Resolve SkillTreeConnection endpoints (they snap on this event).
      level.fullyPreLoaded = true;
      level.emit(EntityLevelEvents.PreloadComplete);
      iState.level = level;

      // Frame the camera to the whole tree.
      const box3 = new Box3().setFromObject(level.scene);
      iState.bounds = new Box2(
        new Vector2(box3.min.x - FRAME_PADDING, box3.min.y - FRAME_PADDING),
        new Vector2(box3.max.x + FRAME_PADDING, box3.max.y + FRAME_PADDING)
      );
      iState.bounds.getCenter(iState.center);
      iState.bounds.getSize(iState.size);
      if (iState.canvasSize.width > 0) {
        const props = makeCameraProps(iState);
        sizeCameraToCanvas(props, iState.canvasSize);
        expandCameraToSceneBBox(props);
        applyCamera(iState);
      }

      iState.controller = new SkillTreeController(
        canvas,
        iState,
        level,
        (node) =>
          dispatch(
            setSelectedNode({
              selectedName: node?.name ?? "",
              selectedDescription: node?.description ?? ""
            })
          ),
        (node) => {
          const skillId = node.name ?? node.key;
          dispatch(
            pushModalTyped({
              modalName: "skillTreeDetail",
              modalArg: {
                skillId,
                skillName: node.name ?? node.key,
                skillDescription: node.description ?? "",
                docsLink: node.docsLink,
                learnable: node.isUnlockable,
                unlocksPreset: node.unlocksPreset
              }
            })
          );
        }
      );

      setLoaded(true);

      const renderFrame = () => {
        renderingContext.render(level.scene, camera);
        iState.raf = requestAnimationFrame(renderFrame);
      };
      iState.raf = requestAnimationFrame(renderFrame);
    })();

    return () => {
      cancelled = true;
      if (iState.raf !== undefined) cancelAnimationFrame(iState.raf);
      iState.raf = undefined;
      iState.controller?.dispose();
      iState.controller = undefined;
      iState.renderingContext?.dispose();
      iState.renderingContext = undefined;
      iState.level?.dispose();
      iState.level = undefined;
      setLoaded(false);
    };
  }, [dispatch]);

  // Resize handling (debounced).
  useEffect(() => {
    const iState = iStateRef.current;
    iState.onResizeDebounced ??= debounce((size: SizeAttributes) => {
      const ctx = iState.renderingContext;
      if (!ctx) return;
      iState.canvasSize = size;
      if (ctx.resizeCanvas(size.width, size.height, window.devicePixelRatio)) {
        ctx.resizeCamera(size.width, size.height);
        if (iState.level) reframe(iState);
      }
    }, 45);
    iState.onResizeDebounced(containerRect);
  }, [containerRect]);

  // Reflect learned state onto node rims, then light up the edges between
  // learned nodes. Nodes are updated first so connections see fresh state.
  useEffect(() => {
    const level = iStateRef.current.level;
    if (!level || !loaded) return;
    for (const entity of level.getEntities().values()) {
      if (entity.type === SkillTreeNode.type) {
        const node = entity as SkillTreeNode;
        node.setLearned(!!learnedSkills[node.name ?? node.key]);
      }
    }
    for (const entity of level.getEntities().values()) {
      if (entity.type === SkillTreeConnection.type) {
        (entity as SkillTreeConnection).refreshLearnedState();
      }
    }
  }, [learnedSkills, loaded]);

  return (
    <div className="viewport-renderer" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={cx("viewport-canvas viewport-canvas-background")}
      />
    </div>
  );
}
