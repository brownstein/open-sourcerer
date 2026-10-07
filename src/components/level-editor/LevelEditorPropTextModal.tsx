import { Button } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import shortid from "shortid";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { CodeEditorTextEditor } from "src/components/editor/CodeEditorTextEditor";
import { BaseModal } from "src/components/modals/BaseModal";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { closeEditor, upsertEditor } from "src/redux/scriptEditor/slice";
import { closeCurrentModal } from "src/redux/ui/slice";

import "./LevelEditorPropTextModal.css";
import { levelEditorStore } from "./LevelEditorStore";

export function LevelEditorPropTextModal(
  props: ModalComponentPropsType<"levelEditorPropText">
) {
  const { modalArg, opening, closing } = props;
  const { entityId, propName, initialValue, index, path } = modalArg;
  const dispatch = useAppDispatch();

  const [editorId] = useState(() => shortid());

  useEffect(() => {
    dispatch(upsertEditor({ id: editorId, code: initialValue }));
    return () => {
      dispatch(closeEditor(editorId));
    };
  }, [dispatch, editorId, initialValue]);

  const code = useAppSelector(
    (state) => selectScriptEditor(state, editorId)?.code
  );

  const onApply = useCallback(() => {
    const next = code ?? "";
    if (next !== initialValue) {
      levelEditorStore.pushUndo();
      if (path) {
        levelEditorStore.updateEntityPropertyAtPath(
          entityId,
          propName,
          path,
          next
        );
      } else if (index == null) {
        levelEditorStore.updateEntityProperties(entityId, { [propName]: next });
      } else {
        levelEditorStore.updateEntityPropertyArrayElement(
          entityId,
          propName,
          index,
          next
        );
      }
    }
    dispatch(closeCurrentModal());
  }, [dispatch, code, initialValue, entityId, propName, index, path]);

  const onCancel = useCallback(() => {
    dispatch(closeCurrentModal());
  }, [dispatch]);

  return (
    <BaseModal
      title={`Edit ${propName}`}
      size="large"
      opening={opening}
      closing={closing}
    >
      <div className="level-editor-prop-text-modal">
        <div className="level-editor-prop-text-modal-editor">
          <CodeEditorTextEditor editorId={editorId} />
        </div>
        <div className="level-editor-prop-text-modal-actions">
          <Button color="inherit" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}

export const LevelEditorPropTextModalDefinition: ModalDefinitionType<"levelEditorPropText"> =
  {
    modalName: "levelEditorPropText",
    component: LevelEditorPropTextModal
  };
