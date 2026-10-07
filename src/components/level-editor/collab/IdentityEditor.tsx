import { Box, Stack, TextField, Tooltip } from "@mui/material";

import { spellIconDefs } from "src/components/ui/spells/spellIconDefs";

import { CollabAvatar } from "./CollabAvatar";
import { MaskedIcon } from "./MaskedIcon";
import {
  COLLAB_COLORS,
  CollabIdentity,
  MAX_IDENTITY_NAME_LENGTH
} from "./collabTypes";

/** Name, color swatch, and avatar icon picker, shared by the room modal and
 *  the in-room identity editor. */
export function IdentityEditor({
  identity,
  onChange
}: {
  identity: CollabIdentity;
  onChange: (identity: CollabIdentity) => void;
}) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CollabAvatar identity={identity} size={40} />
        <TextField
          size="small"
          label="Name"
          value={identity.name}
          autoFocus={identity.name === ""}
          onChange={(e) =>
            onChange({
              ...identity,
              name: e.target.value.slice(0, MAX_IDENTITY_NAME_LENGTH)
            })
          }
          sx={{ flex: 1 }}
        />
      </Stack>
      <Stack direction="row" spacing={0.75}>
        {COLLAB_COLORS.map((color) => (
          <Box
            key={color}
            onClick={() => onChange({ ...identity, color })}
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              bgcolor: color,
              cursor: "pointer",
              border: 2,
              borderColor:
                identity.color === color ? "text.primary" : "transparent",
              transition: "border-color 120ms"
            }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {spellIconDefs.map((def) => (
          <Tooltip key={def.iconKey} title={def.name}>
            <Box
              onClick={() => onChange({ ...identity, iconKey: def.iconKey })}
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                bgcolor:
                  identity.iconKey === def.iconKey
                    ? "action.selected"
                    : "transparent",
                "&:hover": { bgcolor: "action.hover" }
              }}
            >
              <MaskedIcon
                url={def.url}
                color={
                  identity.iconKey === def.iconKey
                    ? identity.color
                    : "text.secondary"
                }
                size={18}
              />
            </Box>
          </Tooltip>
        ))}
      </Stack>
    </Stack>
  );
}
