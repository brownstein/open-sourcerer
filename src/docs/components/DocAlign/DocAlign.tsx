import { Box } from "@mui/material";
import { ReactNode } from "react";

import { DocMarkAsTransparent } from "../DocMarkAsTransparent/DocMarkAsTransparent";

export type DocAlignProps = {
  align: "left" | "center" | "right";
  children: ReactNode;
};

export function DocAlign(props: DocAlignProps) {
  return (
    <DocMarkAsTransparent>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          textAlign: props.align,
          alignItems:
            props.align === "left"
              ? "flex-start"
              : props.align === "center"
                ? "center"
                : "flex-end"
        }}
      >
        {props.children}
      </Box>
    </DocMarkAsTransparent>
  );
}
