import cx from "classnames";
import { useContext, useLayoutEffect, useRef } from "react";
import { Vector2, Vector3 } from "three";

import { OverlayProviderEvents } from "src/api/overlay";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { vector3To2 } from "src/engine/util/vecTypes";

import "./PositionedOverlay.less";

export type PositionedOverlayProps = {
  position: Vector3;
  screenSize: Vector2;
  children: React.ReactElement | React.ReactElement[];
  verticalAlign: "top" | "center" | "bottom";
};

export function PositionedOverlay(props: PositionedOverlayProps) {
  const { position, screenSize, children, verticalAlign } = props;

  const controller = useContext(GameControllerContext);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const camera = controller?.level?.cameraDirector?.getViewportCamera();
      if (!camera) return new Vector2();
      const screenPos3 = position.clone().project(camera);
      const screenPos2 = vector3To2(screenPos3);
      screenPos2
        .add(new Vector2(1, 1))
        .multiply(screenSize)
        .multiplyScalar(0.5);
      screenPos2.y = screenSize.y - screenPos2.y;
      screenPos2.round();
      const pos2 = screenPos2;
      wrapper.style.left = `${pos2.x}px`;
      switch (verticalAlign) {
        case "bottom":
          wrapper.style.top = "";
          wrapper.style.bottom = `${screenSize.y - pos2.y}px`;
          break;
        case "top":
        case "center":
          wrapper.style.top = `${pos2.y}px`;
          break;
      }
    };
    update();
    controller?.ctx.level?.ctx?.overlayProvider?.events.on(
      OverlayProviderEvents.RenderFrame,
      update
    );
    return () => {
      controller?.ctx.level?.ctx?.overlayProvider?.events.off(
        OverlayProviderEvents.RenderFrame,
        update
      );
    };
  }, [controller, position, screenSize, verticalAlign]);

  return (
    <div className={cx("positioned-overlay", verticalAlign)} ref={wrapperRef}>
      {children}
    </div>
  );
}
