import { Checkbox, IconButton, Slider, Tooltip } from "@mui/material";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Color } from "three";

import { SpellIconSpec, SpellIconSpecLayer } from "src/api/spellIcons";

import { ColorPicker } from "../color/ColorPicker";
import { getIconDefByKey, spellIconDefs } from "./SpellIcon";
import "./SpellIconCustomizer.css";

const MAX_LAYERS = 16;

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

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<
    number | "background"
  >(0);
  const selectedLayer = useMemo(
    () =>
      selectedLayerIndex === "background"
        ? null
        : value.layers[selectedLayerIndex],
    [selectedLayerIndex, value]
  );

  useEffect(() => {
    if (selectedLayerIndex === "background") return;
    if (selectedLayerIndex >= value.layers.length)
      setSelectedLayerIndex(value.layers.length - 1);
  }, [selectedLayerIndex, value]);

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
    setSelectedLayerIndex(value.layers.length);
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

  return (
    <div className="spell-icon-customizer">
      <div className="spell-icon-customizer-layers-container">
        <h4>{t("iconCustomizer.layers")}</h4>
        <ul className="spell-icon-customizer-layers">
          <li
            className={cx("spell-icon-customizer-layer", {
              selected: selectedLayerIndex === "background"
            })}
            onClick={() => setSelectedLayerIndex("background")}
          >
            <span
              className="layer-preview"
              style={{
                backgroundColor:
                  value.backgroundColor === undefined
                    ? undefined
                    : `#${new Color(value.backgroundColor).getHexString()}`
              }}
            />
            <span className="layer-name">{t("iconCustomizer.background")}</span>
          </li>
          {value.layers.map((l, i) => (
            <li
              key={i}
              className={cx("spell-icon-customizer-layer", {
                selected: selectedLayerIndex === i
              })}
              onClick={() => setSelectedLayerIndex(i)}
            >
              <span
                className="layer-preview"
                style={{
                  WebkitMaskImage: `url(${getIconDefByKey(l.iconKey)?.url})`,
                  maskImage: `url(${getIconDefByKey(l.iconKey)?.url})`,
                  backgroundColor: `#${new Color(l.color).getHexString()}`
                }}
              />
              <span className="layer-name">
                {t("iconCustomizer.layerIndex", { layerIndex: i + 1 })}
              </span>
              {value.layers.length > 1 && (
                <Tooltip title={t("iconCustomizer.deleteLayer")}>
                  <IconButton
                    className="delete-button"
                    size="medium"
                    onClick={() => removeLayer(i)}
                  >
                    -
                  </IconButton>
                </Tooltip>
              )}
            </li>
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
      </div>
      <div className="spell-icon-customizer-layer-details">
        {selectedLayer ? (
          <>
            <h4>{t("iconCustomizer.layerIcon")}</h4>
            <div className="icon-selection">
              {spellIconDefs.map((def) => (
                <div
                  key={def.iconKey}
                  className={cx("icon-selection-icon-container", {
                    selected: selectedLayer.iconKey === def.iconKey
                  })}
                  onClick={() => {
                    if (selectedLayerIndex === "background") return;
                    updateLayer(selectedLayerIndex, {
                      iconKey: def.iconKey
                    });
                  }}
                >
                  <div
                    className="icon-selection-icon"
                    style={{
                      WebkitMaskImage: `url(${def.url})`,
                      maskImage: `url(${def.url})`
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="icon-color-and-position">
              <div className="row">
                <div className="icon-color">
                  <ColorPicker
                    value={`#${new Color(selectedLayer.color).getHexString()}`}
                    onChange={(color) =>
                      updateLayer(Number(selectedLayerIndex), {
                        color: new Color(color).getHex()
                      })
                    }
                  />
                </div>
                <span className="label">
                  {t("iconCustomizer.layerIconColor")}
                </span>
              </div>
              <div className="row">
                <Slider
                  min={-100}
                  max={100}
                  value={selectedLayer.position.x}
                  onChange={(_, v) =>
                    updateLayer(Number(selectedLayerIndex), {
                      position: { ...selectedLayer.position, x: Number(v) }
                    })
                  }
                  size="small"
                />
                <span className="label">
                  {t("iconCustomizer.layerIconPositionX")}
                </span>
              </div>
              <div className="row">
                <Slider
                  min={-100}
                  max={100}
                  value={selectedLayer.position.y}
                  onChange={(_, v) =>
                    updateLayer(Number(selectedLayerIndex), {
                      position: { ...selectedLayer.position, y: Number(v) }
                    })
                  }
                  size="small"
                />
                <span className="label">
                  {t("iconCustomizer.layerIconPositionY")}
                </span>
              </div>
              <div className="row">
                <Slider
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={selectedLayer.scale}
                  onChange={(_, v) =>
                    updateLayer(Number(selectedLayerIndex), {
                      scale: Number(v)
                    })
                  }
                  size="small"
                />
                <span className="label">
                  {t("iconCustomizer.layerIconScale")}
                </span>
              </div>
              <div className="row">
                <Slider
                  min={-180}
                  max={180}
                  value={selectedLayer.rotation}
                  onChange={(_, v) =>
                    updateLayer(Number(selectedLayerIndex), {
                      rotation: Number(v)
                    })
                  }
                  size="small"
                />
                <span className="label">
                  {t("iconCustomizer.layerIconAngle")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <h4>{t("iconCustomizer.background")}</h4>
            <div className="icon-color-and-position">
              <div className="row">
                <div className="icon-color">
                  <ColorPicker
                    value={`#${new Color(value.backgroundColor ?? 0xffffff).getHexString()}`}
                    onChange={(color) =>
                      onChange({
                        ...value,
                        backgroundColor: new Color(color).getHex()
                      })
                    }
                  />
                </div>
                <span className="label">
                  {t("iconCustomizer.backgroundColor")}
                </span>
              </div>
              <div className="row">
                <div className="icon-color">
                  <Checkbox
                    value={value.backgroundColor !== undefined}
                    onChange={(_, checked) => {
                      if (checked) {
                        onChange({
                          ...value,
                          backgroundColor: value.backgroundColor ?? 0x666666
                        });
                      } else {
                        onChange({
                          ...value,
                          backgroundColor: undefined
                        });
                      }
                    }}
                  />
                </div>
                <span className="label">
                  {t("iconCustomizer.backgroundVisible")}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
