import { Tooltip, TooltipProps } from "@mui/material";
import { ReactNode } from "react";

import "./DocTooltip.less";

export type DocTooltipProps = {
  tooltip: ReactNode;
  placement?: TooltipProps["placement"];
  enterDelay?: number;
  leaveDelay?: number;
  focusable?: boolean;
  children?: ReactNode;
};

export function DocTooltip({
  tooltip,
  placement = "top",
  enterDelay = 200,
  leaveDelay = 100,
  focusable = true,
  children
}: DocTooltipProps) {
  return (
    <Tooltip
      title={tooltip}
      placement={placement}
      enterDelay={enterDelay}
      leaveDelay={leaveDelay}
      arrow
      slotProps={{
        tooltip: { className: "doc-tooltip-surface" },
        arrow: { className: "doc-tooltip-arrow" }
      }}
    >
      <span
        className="doc-tooltip-trigger"
        tabIndex={focusable ? 0 : undefined}
      >
        {children}
      </span>
    </Tooltip>
  );
}
