import { Box } from "@mui/material";

/** An icon image tinted a solid color via CSS masking, the same technique
 *  SpellIcon uses. Shared by the member avatar and the icon picker so the
 *  two always render an icon identically. */
export function MaskedIcon({
  url,
  color,
  size
}: {
  url: string;
  color: string;
  size: number | string;
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        backgroundColor: color,
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center"
      }}
    />
  );
}
