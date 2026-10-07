import { Box } from "@mui/material";

import { DocWidth } from "../DocWidth/DocWidth";
import "./DocsBanner.less";

export type DocsBannerProps = {
  src: string;
  alt?: string;
};

export function DocsBanner(props: DocsBannerProps) {
  return (
    <DocWidth size="full">
      <Box className="docs-banner">
        <Box
          component="img"
          className="docs-banner-image"
          src={props.src}
          alt={props.alt ?? ""}
        />
      </Box>
    </DocWidth>
  );
}
