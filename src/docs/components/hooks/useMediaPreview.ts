import { useCallback } from "react";

import { useAppDispatch } from "src/redux/hooks";
import { pushModalTyped } from "src/redux/shared/actions";

export type MediaPreviewArgs = {
  src: string;
  mediaType: "video" | "image";
  label?: string;
  aspectRatio?: string;
};

export function useMediaPreview() {
  const dispatch = useAppDispatch();
  return useCallback(
    (args: MediaPreviewArgs) => {
      dispatch(
        pushModalTyped({
          modalName: "docMediaPreview",
          modalArg: args
        })
      );
    },
    [dispatch]
  );
}
