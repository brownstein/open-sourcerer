import { Box, Tooltip } from "@mui/material";

import { getIconDefByKey } from "src/components/ui/spells/spellIconDefs";

import { MaskedIcon } from "./MaskedIcon";
import { CollabIdentity } from "./collabTypes";

/** Circular member avatar: the chosen spell icon tinted the member's color
 *  via the same CSS-mask technique SpellIcon uses. */
export function CollabAvatar({
  identity,
  size = 26,
  dimmed = false,
  tooltip,
  onClick
}: {
  identity: CollabIdentity;
  size?: number;
  /** Idle/away members render faded. */
  dimmed?: boolean;
  tooltip?: string;
  onClick?: () => void;
}) {
  const iconDef = getIconDefByKey(identity.iconKey);
  const avatar = (
    <Box
      onClick={onClick}
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "action.hover",
        border: `2px solid ${identity.color}`,
        opacity: dimmed ? 0.4 : 1,
        transition: "opacity 200ms",
        cursor: onClick ? "pointer" : "default"
      }}
    >
      {iconDef && (
        <MaskedIcon url={iconDef.url} color={identity.color} size="68%" />
      )}
    </Box>
  );

  return tooltip ? (
    <Tooltip title={tooltip}>
      <Box sx={{ display: "inline-flex" }}>{avatar}</Box>
    </Tooltip>
  ) : (
    avatar
  );
}
