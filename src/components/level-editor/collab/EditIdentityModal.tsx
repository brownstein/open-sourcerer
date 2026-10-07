import { Button, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { IdentityEditor } from "./IdentityEditor";
import { CollabIdentity } from "./collabTypes";
import { loadStoredIdentity, storeIdentity } from "./identityStorage";
import { levelEditorSession } from "./session";

function currentIdentity(): CollabIdentity {
  const self = levelEditorSession.getMembers().find((member) => member.isSelf);
  return self?.state.identity ?? loadStoredIdentity();
}

export function EditIdentityModal(
  props: ModalComponentPropsType<"collabEditIdentity">
) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<CollabIdentity>(currentIdentity);

  const onSave = useCallback(() => {
    const next = { ...draft, name: draft.name.trim() };
    if (next.name.length === 0) return;
    storeIdentity(next);
    levelEditorSession.updateIdentity(next);
    dispatch(closeCurrentModal());
  }, [dispatch, draft]);

  return (
    <BaseModal
      title="Edit name and avatar"
      size="small"
      fitContent
      opening={opening}
      closing={closing}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <IdentityEditor identity={draft} onChange={setDraft} />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="inherit" onClick={() => dispatch(closeCurrentModal())}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={draft.name.trim().length === 0}
            onClick={onSave}
          >
            Save
          </Button>
        </Stack>
      </Stack>
    </BaseModal>
  );
}

export const EditIdentityModalDefinition: ModalDefinitionType<"collabEditIdentity"> =
  {
    modalName: "collabEditIdentity",
    component: EditIdentityModal
  };
