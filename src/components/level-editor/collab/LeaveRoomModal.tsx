import { Button, Stack, Typography } from "@mui/material";
import { useCallback } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { levelEditorSession } from "./session";

export function LeaveRoomModal(
  props: ModalComponentPropsType<"collabLeaveRoom">
) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();

  const onLeave = useCallback(() => {
    levelEditorSession.leave();
    dispatch(closeCurrentModal());
  }, [dispatch]);

  return (
    <BaseModal
      title="Leave the room?"
      size="small"
      fitContent
      opening={opening}
      closing={closing}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Typography variant="body2">
          You'll keep the level as it is now in your editor, and you can rejoin
          with the same code.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="inherit" onClick={() => dispatch(closeCurrentModal())}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onLeave}>
            Leave
          </Button>
        </Stack>
      </Stack>
    </BaseModal>
  );
}

export const LeaveRoomModalDefinition: ModalDefinitionType<"collabLeaveRoom"> =
  {
    modalName: "collabLeaveRoom",
    component: LeaveRoomModal
  };
