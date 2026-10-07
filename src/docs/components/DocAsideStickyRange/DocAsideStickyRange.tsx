import { Box } from "@mui/material";
import { Children, ReactNode, isValidElement } from "react";

import { DocAside, DocAsideProps } from "../DocAside/DocAside";
import "./DocAsideStickyRange.less";

export type DocAsideStickyRangeProps = {
  children: ReactNode;
};

export function DocAsideStickyRange(props: DocAsideStickyRangeProps) {
  const leftAsides: ReactNode[] = [];
  const rightAsides: ReactNode[] = [];
  const contentChildren: ReactNode[] = [];

  Children.forEach(props.children, (child) => {
    if (isValidElement(child) && child.type === DocAside) {
      const side = (child.props as DocAsideProps).side ?? "left";
      (side === "right" ? rightAsides : leftAsides).push(child);
    } else {
      contentChildren.push(child);
    }
  });

  return (
    <Box className="doc-aside-sticky-range">
      <Box className="doc-aside-sticky-range-left">{leftAsides}</Box>
      <Box className="doc-aside-sticky-range-content">{contentChildren}</Box>
      <Box className="doc-aside-sticky-range-right">{rightAsides}</Box>
    </Box>
  );
}
