import { Box, IconButton, Tooltip } from "@mui/material";

import { Icon } from "src/components/ui/icons/Icon";

import "./DocsSearchNavigator.less";

export type DocsSearchNavigatorProps = {
  onBackwardsHighlightNav: () => void;
  onForwardsHighlightNav: () => void;
};

export function DocsSearchNavigator(props: DocsSearchNavigatorProps) {
  return (
    <Box className="docs-search-navigator">
      <Tooltip title="Previous match" arrow>
        <IconButton
          className="docs-search-navigator-button"
          size="small"
          color="secondary"
          onClick={props.onBackwardsHighlightNav}
        >
          <Icon icon="chevronUp" size="font" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Next match" arrow>
        <IconButton
          className="docs-search-navigator-button"
          size="small"
          color="secondary"
          onClick={props.onForwardsHighlightNav}
        >
          <Icon icon="chevronDown" size="font" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
