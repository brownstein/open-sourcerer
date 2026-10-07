import { Box } from "@mui/material";
import { ReactNode } from "react";

const DEFAULT_MIN_ITEM_WIDTH_PX = 240;
const DEFAULT_GAP = 2;

export type DocGridProps = {
  children: ReactNode;
  maxPerRow?: number;
  minItemWidth?: number;
  gap?: number;
};

export function DocGrid(props: DocGridProps) {
  const minItemWidth = props.minItemWidth ?? DEFAULT_MIN_ITEM_WIDTH_PX;
  const gap = props.gap ?? DEFAULT_GAP;
  const { maxPerRow } = props;

  return (
    <Box
      sx={(theme) => {
        const gapValue = theme.spacing(gap);
        const minColumn = maxPerRow
          ? `calc((100% - (${maxPerRow - 1} * ${gapValue})) / ${maxPerRow})`
          : `${minItemWidth}px`;
        return {
          display: "grid",
          gap,
          gridTemplateColumns: `repeat(auto-fit, minmax(${minColumn}, 1fr))`
        };
      }}
    >
      {props.children}
    </Box>
  );
}
