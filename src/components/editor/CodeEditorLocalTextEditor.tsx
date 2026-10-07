import { useCallback, useEffect, useRef, useState } from "react";

import { SpellError } from "src/api/spells";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { useAppSelector } from "src/redux/hooks";
import { selectDarkMode } from "src/redux/settings/selectors";
import { selectEditorFontSize } from "src/redux/ui/selectors";

import { AceEditor, CodeEditorIState, markEditorCurrentLine } from "./util";

export type CodeEditorLocalTextEditorProps = {
  value?: string;
  currentLine?: number;
  error?: SpellError | null;
  readonly?: boolean;
  onChange?: (value: string) => void;
};

export function CodeEditorLocalTextEditor(
  props: CodeEditorLocalTextEditorProps
) {
  const { value, currentLine, error, readonly, onChange } = props;
  const editorFontSize = useAppSelector(selectEditorFontSize);
  const darkMode = useAppSelector(selectDarkMode);

  const [editorContainerRef, editorContainerRect] =
    useMeasureSize<HTMLDivElement>();

  const iStateRef = useRef<CodeEditorIState>({});

  const editorTheme = darkMode ? "chaos" : "github";
  const [code, setCode] = useState<string>(value ?? "");

  const callbacksRef = useRef({ onChange });
  callbacksRef.current.onChange = onChange;

  const updateCode = useCallback((value: string) => {
    setCode(value);
    callbacksRef.current.onChange?.(value);
  }, []);

  useEffect(() => {
    setCode((extant) => value ?? extant);
  }, [value]);

  useEffect(() => {
    const iState = iStateRef.current;
    if (!iState.editor) return;
    if (!iState.editorMarkings) iState.editorMarkings = {};
    markEditorCurrentLine(
      iState.editor,
      iState.editorMarkings,
      error?.line ?? currentLine ?? null,
      error?.message
    );
  }, [currentLine, error]);

  return (
    <div ref={editorContainerRef} className="code-editor-local-text-editor">
      {editorContainerRect.width && (
        <AceEditor
          mode="javascript"
          value={code}
          readOnly={readonly}
          onChange={updateCode}
          onLoad={(editor) => {
            iStateRef.current.editor = editor;
            editor.setOptions({
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: false
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
