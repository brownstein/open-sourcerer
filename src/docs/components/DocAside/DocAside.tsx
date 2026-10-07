import { Box } from "@mui/material";
import { ReactNode } from "react";

import "./DocAside.less";

export type DocAsideSide = "left" | "right";
export type DocAsideCollapseBehavior = "inline" | "hide";

export type DocAsideProps = {
  side?: DocAsideSide;
  sticky?: boolean;
  whenCollapsed?: DocAsideCollapseBehavior;
  children: ReactNode;
};

export function DocAside(props: DocAsideProps) {
  const side = props.side ?? "left";
  const sticky = props.sticky ?? false;
  const whenCollapsed = props.whenCollapsed ?? "inline";
  const className = [
    "doc-aside",
    `doc-aside-${side}`,
    sticky ? "doc-aside-sticky" : null,
    `doc-aside-collapse-${whenCollapsed}`
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Box className={className}>
      <Box className="doc-aside-content">{props.children}</Box>
    </Box>
  );
}
