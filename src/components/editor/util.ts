import { Ace, Range } from "ace-builds";
import "ace-builds/src-noconflict/theme-chaos";
import "ace-builds/src-noconflict/theme-github";
import { ComponentType } from "react";
import { IAceEditorProps } from "react-ace";

import { AutocompleteWorkerConnection } from "src/scripting/runtime/AutocompleteWorkerConnection";

import AceEditorShim, { langTools } from "./AceShim";
import { CodeEditorCompletionProvider } from "./CodeEditorCompletionProvider";

export const AceEditor = AceEditorShim as ComponentType<IAceEditorProps>;

export type EditorMarkState = {
  currentLineMarkerId?: number;
  currentLineGutterDecorationRow?: number;
  currentLineGutterClass?: string;
};

export type CodeEditorIState = {
  editor?: Ace.Editor;
  editorMarkings?: EditorMarkState;
};

export const markerClasses = {
  currentLine: "current-line",
  error: "error-line"
};

export const gutterClasses = {
  currentLine: "current-line gutter-current-line",
  error: "error-line gutter-error-line"
};

export function markEditorCurrentLine(
  editor: Ace.Editor,
  markState: EditorMarkState,
  currentLine: number | null,
  errorMessage?: string | null
) {
  const session = editor.getSession();
  if (markState.currentLineMarkerId !== undefined) {
    session.removeMarker(markState.currentLineMarkerId);
    markState.currentLineMarkerId = undefined;
  }
  if (
    markState.currentLineGutterDecorationRow !== undefined &&
    markState.currentLineGutterClass
  ) {
    session.removeGutterDecoration(
      markState.currentLineGutterDecorationRow,
      markState.currentLineGutterClass
    );
    markState.currentLineGutterDecorationRow = undefined;
    markState.currentLineGutterClass = undefined;
  }
  if (!errorMessage) {
    session.setAnnotations([]);
  }

  let markerClass = markerClasses.currentLine;
  let gutterClass = gutterClasses.currentLine;

  if (errorMessage) {
    markerClass = markerClasses.error;
    gutterClass = gutterClasses.error;
  }

  if (currentLine !== null) {
    const markerRange = new Range(currentLine, 0, currentLine, Infinity);
    markState.currentLineMarkerId = session.addMarker(
      markerRange,
      markerClass,
      "screenLine",
      false
    );
    session.addGutterDecoration(currentLine, gutterClass);
    markState.currentLineGutterDecorationRow = currentLine;
    markState.currentLineGutterClass = gutterClass;
  }

  if (errorMessage) {
    session.setAnnotations([
      {
        type: "error",
        text: errorMessage,
        row: currentLine ?? 0,
        column: 0
      }
    ]);
  }
}

// ---------------------------------------------------------------------------
// HMR-safe autocomplete singleton
//
// Module-level code re-runs on every hot-reload. Without a guard, each
// reload spawns a new Worker (loading @babel/standalone, ~15MB) and calls
// langTools.addCompleter() again — accumulating abandoned workers.
//
// Vite's import.meta.hot.data lets a module hand arbitrary state to the
// next hot cycle via a dispose() callback, so we can:
//   - dispose the stale worker before the old module is discarded
//   - reuse the same provider object already registered in langTools
//   - start a fresh worker wired into that provider
// On first load (no hot data) everything is created from scratch.
// ---------------------------------------------------------------------------
type _HotData = {
  connection: AutocompleteWorkerConnection;
  provider: CodeEditorCompletionProvider;
};
const _prev = import.meta.hot?.data as _HotData | undefined;

let _autocompleteConnection: AutocompleteWorkerConnection;
let _autoCompleteProvider: CodeEditorCompletionProvider;

if (_prev?.connection && _prev?.provider) {
  // HMR reload: dispose stale worker, reuse provider already in langTools.
  _prev.connection.dispose();
  _autocompleteConnection = new AutocompleteWorkerConnection();
  _autoCompleteProvider = _prev.provider;
  _autoCompleteProvider.connection = _autocompleteConnection;
} else {
  // First load: create fresh and register with Ace once.
  _autocompleteConnection = new AutocompleteWorkerConnection();
  _autoCompleteProvider = new CodeEditorCompletionProvider(
    _autocompleteConnection
  );
  langTools.setCompleters([_autoCompleteProvider]);
}

import.meta.hot?.dispose(() => {
  if (!import.meta.hot?.data) return;
  Object.assign(import.meta.hot.data, {
    connection: _autocompleteConnection,
    provider: _autoCompleteProvider
  });
});
