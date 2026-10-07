import {
  Box,
  Divider,
  Grid,
  Stack,
  Typography,
  TypographyProps
} from "@mui/material";
import { Palette, PaletteColor, alpha } from "@mui/material/styles";
import { MDXComponents } from "mdx/types";
import { HTMLAttributes } from "react";

import { ExampleCode } from "../components/code/ExampleCode";
import { Anchor } from "./components/Anchor";
import { Callout } from "./components/Callout/Callout";
import { Definition } from "./components/Definition/Definition";
import { DocAlign } from "./components/DocAlign/DocAlign";
import { DocAside } from "./components/DocAside/DocAside";
import { DocAsideStickyRange } from "./components/DocAsideStickyRange/DocAsideStickyRange";
import { DocConditionalWrapper } from "./components/DocConditionalWrapper/DocConditionalWrapper";
import { DocGrid } from "./components/DocGrid/DocGrid";
import { DocElse, DocIf, DocThen } from "./components/DocIf/DocIf";
import { DocImage } from "./components/DocImage/DocImage";
import { DocLink } from "./components/DocLink/DocLink";
import { DocSolidColorBackground } from "./components/DocSolidColorBackground/DocSolidColorBackground";
import { DocTooltip } from "./components/DocTooltip/DocTooltip";
import { DocVideo } from "./components/DocVideo/DocVideo";
import { DocWidth } from "./components/DocWidth/DocWidth";
import {
  DocNavList,
  DocNavListItem,
  DocNavTile,
  DocNavTileGrid
} from "./components/DocsNav/DocsNavTiles";
import { PlayerName } from "./components/PlayerName/PlayerName";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function makeHeading(variant: TypographyProps["variant"], as: HeadingTag) {
  return function MdxHeading(props: HTMLAttributes<HTMLHeadingElement>) {
    return (
      <Typography
        variant={variant}
        component={as}
        sx={{ mt: 3, mb: 0.7 }}
        {...props}
      />
    );
  };
}

function MdxParagraph(props: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Typography variant="body1" component="p" sx={{ my: 1.0 }} {...props} />
  );
}

function MdxHr(props: HTMLAttributes<HTMLHRElement>) {
  return <Divider {...props} sx={{ my: 3 }} />;
}

function MdxPre({
  style: _strippedStyle,
  ...rest
}: HTMLAttributes<HTMLPreElement>) {
  return <pre {...rest} />;
}

type PaletteColorKey = {
  [K in keyof Palette]: Palette[K] extends PaletteColor ? K : never;
}[keyof Palette];

type SupportedMarkerColorName =
  | "default"
  | "yellow"
  | "red"
  | "green"
  | "blue"
  | "cyan"
  | "purple";

const markerColorNameToPaletteColorName: Record<
  SupportedMarkerColorName,
  PaletteColorKey
> = {
  default: "warning",
  yellow: "warning",
  red: "error",
  green: "success",
  blue: "info",
  cyan: "primary",
  purple: "secondary"
};

function isSupportedMarkerColorName(
  value: string
): value is SupportedMarkerColorName {
  return value in markerColorNameToPaletteColorName;
}

function MdxMark(props: HTMLAttributes<HTMLElement>) {
  const { className, ...rest } = props;
  const colorNameMatch = className?.match(/flexible-marker-([a-z]+)/);
  const rawColorName = colorNameMatch?.[1] ?? "default";
  const colorName: SupportedMarkerColorName = isSupportedMarkerColorName(
    rawColorName
  )
    ? rawColorName
    : "default";
  const paletteColorName = markerColorNameToPaletteColorName[colorName];

  return (
    <Box
      component="mark"
      sx={{
        bgcolor: (theme) => alpha(theme.palette[paletteColorName].main, 0.25),
        color: `${paletteColorName}.light`,
        px: 0.5,
        borderRadius: 0.75,
        fontWeight: 600
      }}
      {...rest}
    />
  );
}

export const mdxComponents = {
  a: DocLink,
  h1: makeHeading("h4", "h1"),
  h2: makeHeading("h5", "h2"),
  h3: makeHeading("h6", "h3"),
  h4: makeHeading("subtitle1", "h4"),
  h5: makeHeading("subtitle2", "h5"),
  h6: makeHeading("overline", "h6"),
  p: MdxParagraph,
  hr: MdxHr,
  pre: MdxPre,
  mark: MdxMark,
  Anchor,
  Box,
  Callout,
  Definition,
  DocAlign,
  DocAside,
  DocAsideStickyRange,
  DocGrid,
  DocSolidColorBackground,
  DocConditionalWrapper,
  DocIf,
  DocThen,
  DocElse,
  DocImage,
  DocLink,
  DocTooltip,
  DocVideo,
  DocWidth,
  ExampleCode,
  PlayerName,
  Grid,
  Stack,
  DocNavTile,
  DocNavListItem,
  DocNavList,
  DocNavTileGrid
} satisfies MDXComponents;
