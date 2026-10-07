import { Box, IconButton, Tooltip } from "@mui/material";

import { Icon } from "src/components/ui/icons/Icon";

import "./DocsPageHistoryNavigator.less";

export type DocsPageHistoryNavigatorProps = {
  onBackwardsNav: () => void;
  onForwardsNav: () => void;
  canBackwardsNav: boolean;
  canForwardsNav: boolean;
};

export function DocsPageHistoryNavigator(props: DocsPageHistoryNavigatorProps) {
  return (
    <Box className="docs-page-history-navigator">
      <Tooltip title="Back" arrow>
        <span>
          <IconButton
            className="docs-page-history-navigator-button"
            size="small"
            onClick={props.onBackwardsNav}
            disabled={!props.canBackwardsNav}
          >
            <Icon icon="chevronLeft" size="font" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Forward" arrow>
        <span>
          <IconButton
            className="docs-page-history-navigator-button"
            size="small"
            onClick={props.onForwardsNav}
            disabled={!props.canForwardsNav}
          >
            <Icon icon="chevronRight" size="font" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
