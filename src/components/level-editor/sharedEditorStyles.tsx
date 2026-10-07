import { InputAdornment, Theme, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Search } from "lucide-react";
import { ReactNode } from "react";

/** Shared visual treatments for the level editor UI, so panels, lists,
 *  and headers stay consistent with each other and the app theme. */

export const panelHeaderTextSx = {
  fontSize: 10.5,
  letterSpacing: 1.1,
  lineHeight: 2,
  color: "text.secondary"
};

/** Full-width section header strip, matching the Layers panel header. */
export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={[
        panelHeaderTextSx,
        {
          display: "block",
          px: 1.5,
          py: 0.25,
          bgcolor: "action.hover",
          borderBottom: 1,
          borderColor: "divider"
        }
      ]}
    >
      {children}
    </Typography>
  );
}

/** Rounded selection-pill treatment for list rows: smooth hover, and a
 *  primary-tinted selected state that reads instantly in both modes. */
export const selectableRowSx = (theme: Theme) => ({
  borderRadius: 1,
  mx: 0.5,
  transition: theme.transitions.create(["background-color", "color"], {
    duration: theme.transitions.duration.shortest
  }),
  "&.Mui-selected": {
    bgcolor: alpha(theme.palette.primary.main, 0.14),
    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) },
    "&.Mui-focusVisible": { bgcolor: alpha(theme.palette.primary.main, 0.24) }
  }
});

export const searchFieldSx = {
  m: 1,
  "& .MuiInputBase-root": { borderRadius: 1.5 },
  "& .MuiInputBase-input": { py: 0.5, fontSize: 13 }
};

export function SearchAdornment() {
  return (
    <InputAdornment position="start" sx={{ color: "text.disabled" }}>
      <Search size={13} />
    </InputAdornment>
  );
}

/** Centered, intentionally-quiet empty state for filtered lists. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body2"
      color="text.disabled"
      sx={{ p: 2, textAlign: "center", fontStyle: "italic" }}
    >
      {children}
    </Typography>
  );
}
