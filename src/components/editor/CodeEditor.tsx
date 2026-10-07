import { useEffect, useRef } from "react";

import { UIComponentProps } from "src/components/ui/config/types";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { openNewCodeEditorPhase2, pushModal } from "src/redux/shared/actions";
import { selectComponentConfigById } from "src/redux/ui/selectors";

import "./CodeEditor.css";
import { CodeEditorTextEditor } from "./CodeEditorTextEditor";
import { CodeEditorToolbar } from "./CodeEditorToolbar";

export type CodeEditorProps = UIComponentProps<"codeEditor"> & {
  minimalControls?: boolean;
};

export function CodeEditor(props: CodeEditorProps) {
  const { tabId } = props;
  const dispatch = useAppDispatch();
  const componentState = useAppSelector((state) =>
    selectComponentConfigById<"codeEditor">(state, tabId)
  );
  const editorState = useAppSelector((state) =>
    componentState?.editorId
      ? selectScriptEditor(state, componentState.editorId)
      : null
  );

  // On mount, begin tracking this editor component in the store.
  // We're just using this ref to avoid double calls on openNewCodeEditor.
  let referenceMountRef = useRef<boolean>(false);
  useEffect(() => {
    if (editorState) return;
    if (componentState?.editorId === undefined) {
      if (referenceMountRef.current) return;
      referenceMountRef.current = true;
      dispatch(openNewCodeEditorPhase2(tabId));
    }
  }, [dispatch, componentState, editorState]);

  return (
    <div className="code-editor">
      <CodeEditorToolbar tabId={tabId} />
      {editorState?.id && <CodeEditorTextEditor editorId={editorState.id} />}
    </div>
  );
}
