import { useContext, useLayoutEffect, useState } from "react";
import { Box3, Vector2 } from "three";

import { EntityLevelAPI } from "src/api/entity";
import { SpellsAPI } from "src/api/spells";
import {
  TutorialEvaluationContext,
  TutorialInstructionTarget
} from "src/api/tutorials";
import { vector3To2 } from "src/engine/util/vecTypes";
import { useAppStore } from "src/redux/hooks";
import { RootState } from "src/redux/rootState";

import { GameControllerContext } from "../context/GameControllerContext";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function roundRect(r: Rect) {
  const { x, y, width, height } = r;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function isReactEqual(r1: Rect, r2: Rect) {
  return (
    r1.x === r2.x &&
    r1.y === r2.y &&
    r1.width === r2.width &&
    r1.height === r2.height
  );
}

function resolveTargetRect(
  target:
    | TutorialInstructionTarget
    | ((ctx: TutorialEvaluationContext) => TutorialInstructionTarget | null)
    | null,
  state: RootState,
  level?: EntityLevelAPI,
  spells?: SpellsAPI
): Rect | null {
  let resolvedTarget: TutorialInstructionTarget | null = null;
  if (typeof target === "function") {
    resolvedTarget = target({
      state,
      level,
      spells
    });
  } else {
    resolvedTarget = target;
  }
  if (resolvedTarget === null) {
    return null;
  }
  if (resolvedTarget.element) {
    return roundRect(resolvedTarget.element.getBoundingClientRect());
  }
  if (resolvedTarget.firstElement) {
    for (const el of resolvedTarget.firstElement) {
      if (el) {
        return roundRect(el.getBoundingClientRect());
      }
    }
  }
  if (resolvedTarget.nearestElement) {
    const element = [...resolvedTarget.nearestElement].at(0);
    if (!element) return null;
    return roundRect(element.getBoundingClientRect());
  }
  if (resolvedTarget.position) {
    return roundRect({
      x: resolvedTarget.position.x,
      y: resolvedTarget.position.y,
      width: 0,
      height: 0
    });
  }
  if (resolvedTarget.entityId) {
    if (!level) return null;
    const camera = level.cameraDirector.getViewportCamera();
    if (!camera) return null;
    const viewportEl =
      document.querySelector<HTMLCanvasElement>(".viewport-canvas");
    if (!viewportEl?.checkVisibility()) return null;
    const viewportRect = viewportEl.getBoundingClientRect();
    if (viewportRect.width === 0 || viewportRect.height === 0) return null;
    const entity = level?.getEntity(resolvedTarget.entityId);
    if (!entity?.object3D) return null;
    const viewportOffset = new Vector2(viewportRect.left, viewportRect.top);
    const viewportSize = new Vector2(viewportRect.width, viewportRect.height);
    const entityBBox = new Box3();
    entityBBox.expandByObject(entity.object3D);
    const min = entityBBox.min.clone();
    const max = entityBBox.max.clone();
    min.z = 0;
    max.z = 0;
    min.project(camera);
    max.project(camera);
    const mult = new Vector2(0.5, -0.5);
    const offset = new Vector2(0.5, 0.5);
    const min2 = vector3To2(min).multiply(mult).add(offset);
    const max2 = vector3To2(max).multiply(mult).add(offset);
    if (max2.x < 0 || min2.y < 0 || min2.x > 1 || max2.y > 1) return null;
    min2.multiply(viewportSize).add(viewportOffset);
    max2.multiply(viewportSize).add(viewportOffset);
    return roundRect({
      x: min2.x,
      y: max2.y,
      width: max2.x - min2.x,
      height: min2.y - max2.y
    });
  }
  return null;
}

export function useTargetPosition(
  target:
    | ((ctx: TutorialEvaluationContext) => TutorialInstructionTarget | null)
    | null
) {
  const controller = useContext(GameControllerContext);
  const store = useAppStore();
  const level = controller?.level;
  const spells = controller?.spellRuntime;

  const [screenRect, setScreenRect] = useState<Rect | null>(() =>
    resolveTargetRect(target, store.getState(), level, spells)
  );

  useLayoutEffect(() => {
    if (!target) return;
    let updating = true;
    const updateRect = () => {
      if (!updating) return;
      requestAnimationFrame(updateRect);
      const resolved = resolveTargetRect(
        target,
        store.getState(),
        level,
        spells
      );
      setScreenRect((extant) => {
        if (resolved === null) return null;
        if (extant === null) return resolved;
        if (isReactEqual(extant, resolved)) return extant;
        return resolved;
      });
    };
    updateRect();
    return () => {
      updating = false;
    };
  }, [target, store, level, spells]);

  return screenRect;
}
