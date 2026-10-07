import { IconButton, Tooltip } from "@mui/material";

import { Icon } from "src/components/ui/icons/Icon";
import { openDocAt } from "src/redux/docsNav/slice";
import { useAppDispatch } from "src/redux/hooks";

export function DocsHomeButton() {
  const dispatch = useAppDispatch();

  return (
    <Tooltip title="Docs Home" arrow>
      <IconButton
        size="small"
        onClick={() => dispatch(openDocAt({ docId: "index" }))}
      >
        <Icon icon="bookFilled" size="font" />
      </IconButton>
    </Tooltip>
  );
}
