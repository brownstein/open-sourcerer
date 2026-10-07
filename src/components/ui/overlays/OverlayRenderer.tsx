import cx from "classnames";
import { useContext, useEffect, useMemo, useState } from "react";
import { Vector2 } from "three";

import {
  OverlayAPI,
  OverlayPosition,
  OverlayProviderEvents
} from "src/api/overlay";
import { OverlayContext } from "src/components/context/OverlayContext";
import { useMeasureSize } from "src/components/util/useMeasureSize";

import "./OverlayRenderer.less";

export type OverlayRendererProps = {
  position: OverlayPosition;
  className?: string;
};

export function useOverlays(position: OverlayPosition) {
  const ctx = useContext(OverlayContext);
  const [overlays, setOverlays] = useState<OverlayAPI<unknown>[]>([]);

  useEffect(() => {
    const onUpdate = () => {
      if (!ctx) return;
      setOverlays(
        ctx.overlays?.filter((o) => o.spec.position === position) ?? []
      );
    };
    onUpdate();
    ctx?.events.on(OverlayProviderEvents.UpdateOverlays, onUpdate);
    return () => {
      ctx?.events.off(OverlayProviderEvents.UpdateOverlays, onUpdate);
    };
  }, [ctx, position]);

  return overlays;
}

export function OverlayRenderer(props: OverlayRendererProps) {
  const { position, className } = props;
  const [containerRef, containerSize] = useMeasureSize<HTMLDivElement>();
  const ctx = useContext(OverlayContext);
  const overlays = useOverlays(position);

  const size = useMemo(
    () => new Vector2(containerSize.width, containerSize.height),
    [containerSize]
  );

  return (
    <div
      className={cx("overlay-renderer", className, position.toLowerCase())}
      ref={containerRef}
    >
      {ctx &&
        overlays.map((o) => {
          const OverlayComponent = o.spec.component;
          return (
            <OverlayComponent
              key={o.id}
              id={o.id}
              api={ctx}
              screenSize={size}
              overlayProps={o.spec.overlayProps}
            />
          );
        })}
    </div>
  );
}
