import { Box } from "@mui/material";
import { useSelector } from "react-redux";

import { selectPlayerName } from "src/redux/status/selectors";

export function PlayerName() {
  const playerName = useSelector(selectPlayerName);

  return (
    <Box
      component="span"
      sx={{
        fontWeight: 600,
        color: "secondary.main"
      }}
    >
      {playerName}
    </Box>
  );
}
