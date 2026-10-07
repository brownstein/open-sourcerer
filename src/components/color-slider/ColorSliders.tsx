import { Slider } from "@mui/material";
import React from "react";

import "./ColorSliders.less";

export type RGBAColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ColorSlidersProps = {
  color: RGBAColor;
  onChange: (color: RGBAColor) => void;
};

export function ColorSliders({ color, onChange }: ColorSlidersProps) {
  return (
    <div className="color-sliders">
      <label>
        R:{" "}
        <Slider
          min={0}
          max={255}
          value={color.r}
          onChange={(_, v) => onChange({ ...color, r: Number(v) })}
        />
      </label>
      <label>
        G:{" "}
        <Slider
          min={0}
          max={255}
          value={color.g}
          onChange={(_, v) => onChange({ ...color, g: Number(v) })}
        />
      </label>
      <label>
        B:{" "}
        <Slider
          min={0}
          max={255}
          value={color.b}
          onChange={(_, v) => onChange({ ...color, b: Number(v) })}
        />
      </label>
      <label>
        A:{" "}
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={color.a}
          onChange={(_, v) => onChange({ ...color, a: Number(v) })}
        />
      </label>
    </div>
  );
}
