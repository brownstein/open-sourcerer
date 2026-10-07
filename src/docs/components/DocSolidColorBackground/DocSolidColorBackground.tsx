import { Box, Palette, alpha } from "@mui/material";
import { ReactNode } from "react";

import { DocMarkAsTransparent } from "../DocMarkAsTransparent/DocMarkAsTransparent";
import { DocWidth, DocWidthSize } from "../DocWidth/DocWidth";
import "./DocSolidColorBackground.less";

type NonColorKeys =
  | "mode"
  | "contrastThreshold"
  | "tonalOffset"
  | "getContrastText"
  | "augmentColor";

type PalettePath = {
  [K in keyof Palette as K extends NonColorKeys
    ? never
    : K]: Palette[K] extends string
    ? K
    : Palette[K] extends object
      ? {
          [SubK in keyof Palette[K]]: Palette[K][SubK] extends string
            ? `${K & string}.${SubK & string}`
            : never;
        }[keyof Palette[K]]
      : never;
}[Exclude<keyof Palette, NonColorKeys>];

export type DocSolidColorBackgroundProps = {
  bgColor?: PalettePath;
  bgOpacity?: number;
  textColor?: PalettePath;
  contentWidth?: DocWidthSize;
  children?: ReactNode;
};

function resolvePalettePath(palette: Palette, path: PalettePath): string {
  return path.split(".").reduce<any>((obj, key) => obj[key], palette);
}

export function DocSolidColorBackground(props: DocSolidColorBackgroundProps) {
  const bgColor = props.bgColor ?? "primary.main";
  const bgOpacity = props.bgOpacity ?? 0.08;
  const textColor =
    props.textColor ?? bgOpacity <= 0.25
      ? "text.primary"
      : bgColor.split(".").slice(0, -1).join(".").concat(".contrastText");
  const contentWidth = props.contentWidth ?? "default";

  return (
    <DocWidth size="full">
      <DocMarkAsTransparent>
        <Box
          className="doc-solid-color-background"
          sx={(theme) => {
            const resolvedBg = resolvePalettePath(theme.palette, bgColor);

            return {
              bgcolor: alpha(resolvedBg, bgOpacity),
              color: textColor,
              boxShadow: `inset 20px 0 0 0 ${resolvedBg}, 
                          inset -20px 0 0 0 ${resolvedBg}`,
              borderColor: bgColor
            };
          }}
        >
          <DocWidth size={contentWidth}>{props.children}</DocWidth>
        </Box>
      </DocMarkAsTransparent>
    </DocWidth>
  );
}
