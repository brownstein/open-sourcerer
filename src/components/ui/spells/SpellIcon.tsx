import { useMemo } from "react";
import { Color } from "three";

import { SpellIconSpec, SpellIconSpecLayer } from "src/api/spellIcons";

import "./SpellIcon.less";
import { getIconDefByKey } from "./spellIconDefs";

export { spellIconDefs, getIconDefByKey } from "./spellIconDefs";
export type { SpellIconIconDef } from "./spellIconDefs";

export type SpellIconProps = {
  spec: SpellIconSpec;
  size?: number;
};

export function SpellIcon({ spec, size = 64 }: SpellIconProps) {
  const bgHex = useMemo(
    () => spec.backgroundColor === undefined ? "transparent" : `#${new Color(spec.backgroundColor).getHexString()}`,
    [spec.backgroundColor]
  );

  return (
    <div
      className="spell-icon"
      style={{ width: size, height: size, backgroundColor: bgHex }}
    >
      {spec.layers.map((layer, i) => (
        <SpellIconLayer key={i} layer={layer} size={size} />
      ))}
    </div>
  );
}

function SpellIconLayer({ layer, size }: { layer: SpellIconSpecLayer; size: number }) {
  const def = getIconDefByKey(layer.iconKey);
  const colorHex = useMemo(
    () => `#${new Color(layer.color).getHexString()}`,
    [layer.color]
  );

  if (!def) return null;

  const offsetX = (layer.position.x / 100) * size;
  const offsetY = (layer.position.y / 100) * size;

  return (
    <div
      className="spell-icon-layer"
      style={{
        WebkitMaskImage: `url(${def.url})`,
        maskImage: `url(${def.url})`,
        backgroundColor: colorHex,
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${layer.scale}) rotate(${layer.rotation ?? 0}deg)`,
      }}
    />
  );
}
