import { Box } from "@mui/material";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";

export type DocMediaPreviewModalProps =
  ModalComponentPropsType<"docMediaPreview">;

export function DocMediaPreviewModal(props: DocMediaPreviewModalProps) {
  const { src, mediaType, label, aspectRatio } = props.modalArg;

  return (
    <BaseModal title={label} opening={props.opening} closing={props.closing}>
      {mediaType === "video" ? (
        <Box
          component="video"
          className="doc-media-preview-element"
          src={src}
          autoPlay
          loop
          muted
          playsInline
          controls
          sx={{ aspectRatio }}
        />
      ) : (
        <Box
          component="img"
          className="doc-media-preview-element"
          src={src}
          alt={label ?? ""}
          sx={{ aspectRatio }}
        />
      )}
    </BaseModal>
  );
}

export const DocMediaPreviewModalDefinition: ModalDefinitionType<"docMediaPreview"> =
  {
    modalName: "docMediaPreview",
    component: DocMediaPreviewModal
  };
