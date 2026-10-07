import { Box, ButtonBase, Collapse } from "@mui/material";
import { Palette, PaletteColor, alpha } from "@mui/material/styles";
import { ReactNode, useState } from "react";

import { Icon, IconName } from "src/components/ui/icons/Icon";

import "./Callout.less";

type CalloutType = "info" | "tip" | "important" | "warning";
type PaletteColorKey = {
  [K in keyof Palette]: Palette[K] extends PaletteColor ? K : never;
}[keyof Palette];

const calloutTypeToPaletteColorName: Record<CalloutType, PaletteColorKey> = {
  info: "success",
  tip: "info",
  important: "secondary",
  warning: "error"
};

const calloutTypeToIcon: Record<CalloutType, IconName> = {
  info: "bookFilled",
  tip: "check",
  important: "wizardHat",
  warning: "exclamationFilled"
};

const calloutTypeToDefaultTitle: Record<CalloutType, string> = {
  info: "Info",
  tip: "Tip",
  important: "Important",
  warning: "Warning"
};

export type CalloutProps = {
  type?: CalloutType;
  title?: string;
  isCollapsible?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
};

export function Callout({
  type = "info",
  title,
  isCollapsible = false,
  defaultOpen = false,
  children
}: CalloutProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const paletteColorName = calloutTypeToPaletteColorName[type];
  const iconName = calloutTypeToIcon[type];
  const resolvedTitle = title ?? calloutTypeToDefaultTitle[type];

  const baseCalloutHeader = (
    <Box className="callout-header" sx={{ color: `${paletteColorName}.main` }}>
      <Box className="callout-header-icon">
        <Icon icon={iconName} size="font" />
      </Box>

      <Box component="span" className="callout-header-title">
        {resolvedTitle}
      </Box>

      {isCollapsible && (
        <Box
          className="callout-header-chevron"
          sx={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <Icon icon="chevronUpFilled" size="font" />
        </Box>
      )}
    </Box>
  );

  const calloutHeader = isCollapsible ? (
    <ButtonBase
      className="callout-header-button"
      onClick={() => setIsOpen((open) => !open)}
      focusRipple
    >
      {baseCalloutHeader}
    </ButtonBase>
  ) : (
    baseCalloutHeader
  );

  const baseCalloutBody = <Box className="callout-body">{children}</Box>;

  const calloutBody = isCollapsible ? (
    <Collapse in={isOpen}>{baseCalloutBody}</Collapse>
  ) : (
    baseCalloutBody
  );

  return (
    <Box
      className="callout"
      sx={{
        borderLeftColor: `${paletteColorName}.main`,
        bgcolor: (theme) => alpha(theme.palette[paletteColorName].main, 0.08),
        color: "text.primary"
      }}
    >
      {calloutHeader}
      {calloutBody}
    </Box>
  );
}
