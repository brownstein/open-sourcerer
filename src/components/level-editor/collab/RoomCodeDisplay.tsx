import { Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { copyRoomCode } from "./copyRoomCode";

/** The room code as a click-to-copy chip, shared by the host screen, the
 *  joining screen, and the in-room popover. */
export function RoomCodeDisplay({
  code,
  compact = false
}: {
  code: string;
  /** Smaller type for tight surfaces like the popover. */
  compact?: boolean;
}) {
  const [copyResult, setCopyResult] = useState<"copied" | "failed" | null>(
    null
  );
  return (
    <Tooltip
      title={
        copyResult === "copied"
          ? "Copied!"
          : copyResult === "failed"
            ? "Couldn't copy. Select the code and copy it yourself."
            : "Click to copy"
      }
    >
      <Typography
        variant={compact ? "h6" : "h4"}
        onClick={() => {
          void copyRoomCode(code).then((ok) =>
            setCopyResult(ok ? "copied" : "failed")
          );
        }}
        onMouseLeave={() => setCopyResult(null)}
        sx={{
          letterSpacing: compact ? 4 : 6,
          fontFamily: "monospace",
          cursor: "pointer",
          userSelect: "all",
          px: compact ? 1.5 : 2,
          py: compact ? 0.5 : 1,
          borderRadius: 1.5,
          bgcolor: "action.hover"
        }}
      >
        {code}
      </Typography>
    </Tooltip>
  );
}
