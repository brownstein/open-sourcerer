import { Box } from "@mui/material";
import { ReactNode } from "react";

import { DocMarkAsTransparent } from "../DocMarkAsTransparent/DocMarkAsTransparent";

export type DocWidthSize = "default" | "wide" | "full";

export type DocWidthProps = {
  size?: DocWidthSize;
  children: ReactNode;
};

export function DocWidth(props: DocWidthProps) {
  const size = props.size ?? "default";
  return (
    <DocMarkAsTransparent>
      <Box className={`doc-width-${size}`}>{props.children}</Box>
    </DocMarkAsTransparent>
  );
}
