import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useRef } from "react";

import { useMediaPreview } from "../hooks/useMediaPreview";
import "./DocVideo.less";

export type DocVideoProps = {
  src: string;
  label?: string;
  aspectRatio?: string;
};

export function DocVideo(props: DocVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const openPreview = useMediaPreview();

  const aspectRatio = props.aspectRatio ?? "16 / 9";

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            videoElement.play().catch(() => {});
          } else {
            videoElement.pause();
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    openPreview({
      src: props.src,
      mediaType: "video",
      label: props.label,
      aspectRatio
    });
  };

  // feels better imo -alvin
  const handleVideoEnded = () => {
    setTimeout(() => {
      videoRef.current?.play();
    }, 1000);
  };

  return (
    <Stack className="doc-video" alignItems="center" onClick={handleClick}>
      {props.label && (
        <Typography variant="subtitle2" className="doc-video-label">
          {props.label}
        </Typography>
      )}
      <Box
        component="video"
        className="doc-video-element"
        ref={videoRef}
        sx={{ aspectRatio }}
        src={props.src}
        autoPlay
        onEnded={handleVideoEnded}
        muted
        playsInline
      />
    </Stack>
  );
}
