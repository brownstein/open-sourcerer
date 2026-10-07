import { Button, IconButton, Slider, Tooltip } from "@mui/material";
import cx from "classnames";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { SpellIconSpec, SpellIconSpecLayer } from "src/api/spellIcons";
import { ColorPalette } from "src/components/ui/color/ColorPalette";
import { Icon } from "src/components/ui/icons/Icon";

import { SpellIcon, spellIconDefs } from "./SpellIcon";
import "./SpellIconCustomizer.css";

const MAX_LAYERS = 16;

const defaultLayerColors = [
  0xffffff, 0x000000, 0xff5a1f, 0x0acaff, 0xffd906, 0xe885ff, 0x00ff88,
  0xff0000, 0x0a7cff, 0xcdff85, 0xffa75e, 0x77daff, 0xb1a69c
];

const defaultBgColors = [
  0x1a1a2e, 0x2d1b4e, 0x1b3a4e, 0x3a1b1b, 0x1b3a1b, 0x3a3a1b, 0x000000,
  0x222222, 0x444444, 0xffffff, 0x0acaff, 0xff5a1f, 0xffd906
];

export type SpellIconCustomizerProps = {
  value: SpellIconSpec;
  onChange: (spec: SpellIconSpec) => void;
  showSpellIcon?: boolean;
};

export function SpellIconCustomizer({
  value,
  onChange,
  showSpellIcon
}: SpellIconCustomizerProps) {
  const { t } = useTranslation();

  const updateLayer = useCallback(
    (index: number, patch: Partial<SpellIconSpecLayer>) => {
      const newLayers = value.layers.map((l, i) =>
        i === index ? { ...l, ...patch } : l
      );
      onChange({ ...value, layers: newLayers });
    },
    [value, onChange]
  );

  const addLayer = useCallback(() => {
    if (value.layers.length >= MAX_LAYERS) return;
    const newLayer: SpellIconSpecLayer = {
      iconKey: spellIconDefs[0].iconKey,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      color: 0xffffff
    };
    onChange({ ...value, layers: [...value.layers, newLayer] });
  }, [value, onChange]);

  const removeLayer = useCallback(
    (index: number) => {
      onChange({
        ...value,
        layers: value.layers.filter((_, i) => i !== index)
      });
    },
    [value, onChange]
  );

  const [selectedLayer, setSelectedLayer] = useState<number | "background">(0);

  return (
    <div className="spell-icon-customizer">
      <ul className="spell-icon-customizer-layers">
        <li
          className={cx("spell-icon-customizer-layer", {
            selected: selectedLayer === "background"
          })}
          onClick={() => setSelectedLayer("background")}
        ></li>
        {value.layers.map((l, i) => (
          <li
            key={i}
            className={cx("spell-icon-customizer-layer", {
              selected: selectedLayer === i
            })}
            onClick={() => setSelectedLayer(i)}
          ></li>
        ))}
        {value.layers.length < MAX_LAYERS && (
          <li className="spell-icon-customizer-layer-add">
            <Tooltip title={t("iconCustomizer.addLayer")}>
              <IconButton size="medium" onClick={addLayer}>
                +
              </IconButton>
            </Tooltip>
          </li>
        )}
      </ul>
      <div className="spell-icon-customizer-layer-details"></div>
    </div>
    // <div className="spell-icon-customizer">
    //   {showSpellIcon && (
    //     <div className="spell-icon-customizer-preview">
    //       <SpellIcon spec={value} size={128} />
    //     </div>
    //   )}
    //   <div className="spell-icon-customizer-controls">
    //     <div className="spell-icon-customizer-section">
    //       <div className="spell-icon-layer-editor">
    //         <div className="spell-icon-layer-editor-header">
    //           <span className="spell-icon-layer-editor-title">Background</span>
    //         </div>
    //         <ColorPalette
    //           colors={defaultBgColors}
    //           selected={value.backgroundColor}
    //           onChange={(color) =>
    //             onChange({ ...value, backgroundColor: color })
    //           }
    //           includePicker
    //         />
    //       </div>
    //     </div>
    //     <div className="spell-icon-customizer-layers">
    //       <div className="spell-icon-customizer-layers-header">
    //         <h4>Layers</h4>
    //         <Button
    //           className="spell-icon-customizer-add-layer"
    //           size="small"
    //           onClick={addLayer}
    //           disabled={value.layers.length >= MAX_LAYERS}
    //         >
    //           + Add Layer
    //         </Button>
    //       </div>
    //       <div className="spell-icon-customizer-layers-list">
    //         {value.layers.map((layer, i) => (
    //           <LayerEditor
    //             key={i}
    //             layer={layer}
    //             index={i}
    //             onChange={updateLayer}
    //             onRemove={removeLayer}
    //           />
    //         ))}
    //       </div>
    //     </div>
    //   </div>
    // </div>
  );
}

type LayerEditorProps = {
  layer: SpellIconSpecLayer;
  index: number;
  onChange: (index: number, patch: Partial<SpellIconSpecLayer>) => void;
  onRemove: (index: number) => void;
};

function LayerEditor({ layer, index, onChange, onRemove }: LayerEditorProps) {
  return (
    <div className="spell-icon-layer-editor">
      <div className="spell-icon-layer-editor-header">
        <span className="spell-icon-layer-editor-title">Layer {index + 1}</span>
        <Button
          className="spell-icon-layer-editor-remove"
          size="small"
          onClick={() => onRemove(index)}
        >
          <Icon icon="closeWindow" size="font" />
        </Button>
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Icon</label>
        <div className="spell-icon-layer-icon-grid">
          {spellIconDefs.map((def) => (
            <button
              key={def.iconKey}
              className={cx(
                "spell-icon-layer-icon-option",
                layer.iconKey === def.iconKey && "selected"
              )}
              onClick={() => onChange(index, { iconKey: def.iconKey })}
              title={def.name}
            >
              <div
                className="spell-icon-layer-icon-mask"
                style={{
                  WebkitMaskImage: `url(${def.url})`,
                  maskImage: `url(${def.url})`
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Color</label>
        <ColorPalette
          colors={defaultLayerColors}
          selected={layer.color}
          onChange={(color) => onChange(index, { color })}
          includePicker
        />
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Position X</label>
        <Slider
          min={-100}
          max={100}
          value={layer.position.x}
          onChange={(_, v) =>
            onChange(index, { position: { ...layer.position, x: Number(v) } })
          }
          size="small"
        />
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Position Y</label>
        <Slider
          min={-100}
          max={100}
          value={layer.position.y}
          onChange={(_, v) =>
            onChange(index, { position: { ...layer.position, y: Number(v) } })
          }
          size="small"
        />
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Scale</label>
        <Slider
          min={0.1}
          max={3}
          step={0.05}
          value={layer.scale}
          onChange={(_, v) => onChange(index, { scale: Number(v) })}
          size="small"
        />
      </div>
      <div className="spell-icon-layer-editor-field">
        <label>Rotation</label>
        <Slider
          min={-180}
          max={180}
          value={layer.rotation ?? 0}
          onChange={(_, v) => onChange(index, { rotation: Number(v) })}
          size="small"
        />
      </div>
    </div>
  );
}
