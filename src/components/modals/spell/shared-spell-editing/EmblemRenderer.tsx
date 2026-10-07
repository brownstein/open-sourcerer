import { useEffect, useMemo } from "react";

import { Object3DRenderer } from "src/components/ui/item/ItemRenderer";
import { SpellDefinition } from "src/items/spells/spell";

type EmblemRendererProps = {
  emblem: string;
};

export function EmblemRenderer(props: EmblemRendererProps) {
  const { emblem } = props;
  const emblemSprite = useMemo(
    () => SpellDefinition.getStandaloneEmblem(emblem),
    [emblem]
  );
  useEffect(() => {
    return () => emblemSprite?.dispose();
  }, [emblemSprite]);
  return emblemSprite && <Object3DRenderer object3D={emblemSprite.mesh} />;
}
