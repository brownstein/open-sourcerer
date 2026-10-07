import { Button, Stack, Typography } from "@mui/material";
import { useCallback } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { levelEditorStore } from "./LevelEditorStore";

/** An unknown layer can't be recreated by this editor, so a misclick on its
 *  delete button shouldn't be able to destroy it. */
export function DeleteUnknownLayerModal(
  props: ModalComponentPropsType<"deleteUnknownLayer">
) {
  const { modalArg, opening, closing } = props;
  const dispatch = useAppDispatch();

  const onDelete = useCallback(() => {
    levelEditorStore.removeLayer(modalArg.layerId);
    dispatch(closeCurrentModal());
  }, [dispatch, modalArg.layerId]);

  return (
    <BaseModal
      title={`Delete "${modalArg.layerName}"?`}
      size="small"
      fitContent
      opening={opening}
      closing={closing}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Typography variant="body2">
          This layer is of a type the editor doesn't support, so once deleted it
          can't be recreated here.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="inherit" onClick={() => dispatch(closeCurrentModal())}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={onDelete}>
            Delete
          </Button>
        </Stack>
      </Stack>
    </BaseModal>
  );
}

export const DeleteUnknownLayerModalDefinition: ModalDefinitionType<"deleteUnknownLayer"> =
  {
    modalName: "deleteUnknownLayer",
    component: DeleteUnknownLayerModal
  };
