import { Button, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { levelEditorStore } from "../LevelEditorStore";
import {
  saveEditorStateAsNewSlot,
  saveEditorStateOverExisting
} from "../editorMapActions";
import { getEditorMap } from "../editorMaps";
import { levelEditorSession } from "./session";

/** Asked once per room session when a save matches an existing local slot by
 *  level uuid: overwrite that slot, or fork into a new copy. */
export function RoomSaveConflictModal(
  props: ModalComponentPropsType<"collabSaveConflict">
) {
  const { modalArg, opening, closing } = props;
  const dispatch = useAppDispatch();
  const [map] = useState(() => getEditorMap(modalArg.mapId));

  // The slot can vanish between the prompt opening and a choice (deleted in
  // the level manager); there is nothing left to ask about.
  useEffect(() => {
    if (!map) dispatch(closeCurrentModal());
  }, [map, dispatch]);

  const onSaveAsCopy = useCallback(() => {
    const state = levelEditorStore.getState();
    saveEditorStateAsNewSlot(`${state.levelName || "Untitled"} copy`);
    levelEditorSession.markSaveDecisionMade();
    dispatch(closeCurrentModal());
  }, [dispatch]);

  const onOverwrite = useCallback(() => {
    if (map) {
      saveEditorStateOverExisting(map);
    }
    levelEditorSession.markSaveDecisionMade();
    dispatch(closeCurrentModal());
  }, [dispatch, map]);

  if (!map) return null;

  return (
    <BaseModal
      title="You already have a copy of this level"
      size="small"
      fitContent
      opening={opening}
      closing={closing}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Typography variant="body2">
          {`"${map.name}" (last saved ${new Date(
            map.updatedAt
          ).toLocaleString()}) matches the level in this room. Overwrite it, or save as a new copy?`}
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="inherit" onClick={() => dispatch(closeCurrentModal())}>
            Cancel
          </Button>
          <Button color="inherit" onClick={onSaveAsCopy}>
            Save as a new copy
          </Button>
          <Button variant="contained" onClick={onOverwrite}>
            Overwrite
          </Button>
        </Stack>
      </Stack>
    </BaseModal>
  );
}

export const RoomSaveConflictModalDefinition: ModalDefinitionType<"collabSaveConflict"> =
  {
    modalName: "collabSaveConflict",
    component: RoomSaveConflictModal
  };
