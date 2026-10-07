import { debounce } from "debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMeasureSize } from "src/components/util/useMeasureSize";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectDarkMode } from "src/redux/settings/selectors";
import { selectCutsceneLocked } from "src/redux/status/selectors";
import { selectEditorFontSize } from "src/redux/ui/selectors";

import "./CodeEditorTextEditor.css";
import { useSpellContextState } from "./codeEditorHooks";
import { AceEditor, CodeEditorIState, markEditorCurrentLine } from "./util";

export type CodeEditorTextEditorProps = {
  editorId: string;
  readonly?: boolean;
};

export function CodeEditorTextEditor(props: CodeEditorTextEditorProps) {
  const { editorId, readonly } = props;
  const dispatch = useAppDispatch();
  const editorState = useAppSelector((state) =>
    selectScriptEditor(state, editorId)
  );
  const { running, currentLine, currentError } = useSpellContextState(
    editorState?.runtimeId
  );

  const editorFontSize = useAppSelector(selectEditorFontSize);
  const cutsceneLocked = useAppSelector(selectCutsceneLocked);
  const darkMode = useAppSelector(selectDarkMode);

  const [editorContainerRef, editorContainerRect] =
    useMeasureSize<HTMLDivElement>();

  const iStateRef = useRef<CodeEditorIState>({});

  const editorTheme = darkMode ? "chaos" : "github";
  const [code, setCode] = useState<string>(editorState?.code ?? "");
  const [codeUpdatedAt, setCodeUpdatedAt] = useState<number>(0);

  // On mount, begin tracking this editor component in the store.
  // We're just using this ref to avoid double calls on openNewCodeEditor.
  let referenceMountRef = useRef<boolean>(false);

  // Keep code in sync with store.
  const debouncedUpdateCode = useMemo(
    () =>
      debounce((code: string, updatedAt: number) => {
        if (editorState) {
          if (
            code !== editorState.code &&
            updatedAt > (editorState.codeUpdatedAt ?? 0)
          )
            dispatch(
              upsertEditor({
                ...editorState,
                code
              })
            );
        }
      }, 200),
    [dispatch, editorState]
  );

  useEffect(() => {
    debouncedUpdateCode(code, codeUpdatedAt);
  }, [code, codeUpdatedAt, debouncedUpdateCode]);

  useEffect(() => {
    if (!editorState) return;
    if ((editorState.codeUpdatedAt ?? 0) > codeUpdatedAt) {
      setCode(editorState.code ?? "");
      setCodeUpdatedAt(editorState.codeUpdatedAt ?? Date.now());
    }
  }, [codeUpdatedAt, editorState]);

  const onChangeCode = useCallback((code: string) => {
    setCode(code);
    setCodeUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    const iState = iStateRef.current;
    if (!iState.editor) return;
    if (!iState.editorMarkings) iState.editorMarkings = {};
    markEditorCurrentLine(
      iState.editor,
      iState.editorMarkings,
      currentError?.line ?? currentLine ?? null,
      currentError?.message
    );
  }, [currentLine, currentError]);

  return (
    <div ref={editorContainerRef} className="code-editor-text-editor">
      {editorContainerRect.width && (
        <AceEditor
          mode="javascript"
          value={code}
          readOnly={readonly || running || cutsceneLocked}
          onChange={onChangeCode}
          onLoad={(editor) => {
            iStateRef.current.editor = editor;
            editor.setOptions({
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: false,
            });
            // Display 0-based line numbers to match the spell runtime's
            // source mapping convention.
            (editor.session as any).gutterRenderer = {
              getText(_session: unknown, row: number) {
                return String(row);
              },
              getWidth(
                _session: unknown,
                lastLineText: string,
                config: { characterWidth: number }
              ) {
                return lastLineText.toString().length * config.characterWidth;
              }
            };
          }}
          width={`${editorContainerRect.width}px`}
          height={`${editorContainerRect.height}px`}
          fontSize={editorFontSize}
          tabSize={2}
          theme={editorTheme}
        />
      )}
    </div>
  );
}
