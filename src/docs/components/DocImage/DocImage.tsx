import { Box, Stack, Typography } from "@mui/material";

import { useMediaPreview } from "../hooks/useMediaPreview";
import "./DocImage.less";

export type DocImageProps = {
  src: string;
  label?: string;
  alt?: string;
  aspectRatio?: string;
};

export function DocImage(props: DocImageProps) {
  const openPreview = useMediaPreview();

  const aspectRatio = props.aspectRatio ?? "16 / 9";

  const handleClick = () => {
    openPreview({
      src: props.src,
      mediaType: "image",
      label: props.label,
      aspectRatio
    });
  };

  return (
    <Stack className="doc-image" alignItems="center" onClick={handleClick}>
      {props.label && (
        <Typography variant="subtitle2" className="doc-image-label">
          {props.label}
        </Typography>
      )}
      <Box
        component="img"
        className="doc-image-element"
        sx={{ aspectRatio }}
        src={props.src}
        alt={props.alt ?? props.label ?? ""}
      />
    </Stack>
  );
}
