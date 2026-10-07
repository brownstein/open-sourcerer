import {
  Box,
  ButtonBase,
  Popover,
  Stack,
  TextField,
  Tooltip
} from "@mui/material";
import { useEffect, useState } from "react";
import { ChromePicker } from "react-color";

export type ColorPickerFieldProps = {
  value: string;
  onChange: (hex: string) => void;
  disableHexInput?: boolean;
  size?: number;
  swatchLabel?: string;
  tooltip?: string;
};

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

function normalizeHex(input: string): string | null {
  const match = input.trim().match(HEX6);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function ColorPickerField(props: ColorPickerFieldProps) {
  const {
    value,
    onChange,
    disableHexInput,
    size = 24,
    swatchLabel,
    tooltip
  } = props;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [tooltipHovered, setTooltipHovered] = useState(false);
  const [hexText, setHexText] = useState(value);
  const pickerOpen = Boolean(anchorEl);

  useEffect(() => setHexText(value), [value]);

  const commitHexText = (next: string) => {
    setHexText(next);
    const normalized = normalizeHex(next);
    if (normalized && normalized !== value.toLowerCase()) onChange(normalized);
  };

  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Tooltip
        title={tooltip ?? ""}
        open={Boolean(tooltip) && tooltipHovered && !pickerOpen}
        onOpen={() => setTooltipHovered(true)}
        onClose={() => setTooltipHovered(false)}
      >
        <ButtonBase
          aria-label={swatchLabel ?? "Pick color"}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{
            width: size,
            height: size,
            borderRadius: "50%",
            bgcolor: value,
            border: "2px solid",
            borderColor: "divider",
            transition: (theme) =>
              theme.transitions.create(
                ["transform", "box-shadow", "border-color"],
                { duration: theme.transitions.duration.shorter }
              ),
            "&:hover, &:focus-visible": {
              transform: "scale(1.15)",
              borderColor: "primary.main",
              boxShadow: 3
            }
          }}
        />
      </Tooltip>
      {!disableHexInput && (
        <TextField
          size="small"
          value={hexText}
          onChange={(event) => commitHexText(event.target.value)}
          onBlur={() => setHexText(normalizeHex(hexText) ?? value)}
          sx={{ width: 96 }}
          slotProps={{
            htmlInput: {
              spellCheck: false,
              "aria-label": "Hex color",
              sx: { py: 0.5, fontSize: 13, fontFamily: "monospace" }
            }
          }}
        />
      )}
      <Popover
        open={pickerOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 1, p: 0.5 } } }}
      >
        <Box
          sx={(theme) => ({
            "& input": { color: `${theme.palette.text.primary} !important` },
            "& span": { color: `${theme.palette.text.secondary} !important` },
            "& svg": { fill: `${theme.palette.text.secondary} !important` }
          })}
        >
          <ChromePicker
            color={value}
            disableAlpha
            styles={{
              default: {
                picker: { background: "transparent", boxShadow: "none" }
              }
            }}
            onChange={(color) => onChange(color.hex)}
          />
        </Box>
      </Popover>
    </Stack>
  );
}
