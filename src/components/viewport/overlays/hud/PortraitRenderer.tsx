import { useEffect, useMemo } from "react";

import { Object3DRenderer } from "src/components/ui/item/ItemRenderer";

import { PortraitDefinition } from "./Portrait";
import { HudItemData } from "./hudItem";

export type PortraitRendererProps = {
  portrait?: HudItemData | null;
  className?: string;
};

export function PortraitRenderer(props: PortraitRendererProps) {
  const { portrait, className } = props;
  const portraitRenderInstance = useMemo(() => {
    if (!portrait) return null;
    return PortraitDefinition.getRenderInstance(portrait);
  }, [portrait]);
  useEffect(() => {
    return () => {
      portraitRenderInstance?.dispose?.();
    };
  }, [portraitRenderInstance]);
  if (!portraitRenderInstance) return null;

  return (
    <Object3DRenderer
      object3D={portraitRenderInstance.object3D}
      className={className}
    />
  );
}
