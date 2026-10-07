import { Ace } from "ace-builds";

import { ValueCompletion } from "src/api/spells";
import { SPELL_API_MANIFESTS } from "src/scripting/core/spellApiManifests";
import { AutocompleteWorkerConnection } from "src/scripting/runtime/AutocompleteWorkerConnection";

export type Pos = {
  row: number;
  column: number;
};

export type Completer = {
  getCompletions(
    editor: Ace.Editor,
    session: Ace.EditSession,
    pos: Pos,
    prefix: string,
    callback: (err: Error | null, result?: ValueCompletion[]) => void
  ): void;
};

// Standard completions generated from the manifest — always available.
const standardCompletions: ValueCompletion[] = [
  {
    value: "console.log(",
    score: 0.6,
    meta: "function",
    docText: "Logs a value to the spell console."
  },
  {
    value: "require(",
    score: 0.5,
    meta: "function",
    docText: "Imports a spell module. e.g. var fire = require(\"fire\");"
  },
  // One entry per module, generated from the manifest
  ...Object.entries(SPELL_API_MANIFESTS).map(([name, manifest]) => ({
    value: `require("${name}");`,
    score: 0.2,
    meta: "spell module",
    docText: manifest.description ?? `Import the ${name} module.`
  }))
];

function getStandardCompletions(prefix: string): ValueCompletion[] {
  return standardCompletions.filter((rec) => rec.value.startsWith(prefix));
}

export class CodeEditorCompletionProvider implements Completer {
  connection: AutocompleteWorkerConnection;
  private lastResults: ValueCompletion[] = [];
  private inFlight = false;

  constructor(connection: AutocompleteWorkerConnection) {
    this.connection = connection;
  }

  getCompletions(
    _editor: Ace.Editor,
    session: Ace.EditSession,
    pos: Pos,
    prefix: string,
    callback: (err: Error | null, result: ValueCompletion[]) => void
  ): void {
    const code = session.getValue();
    const standard = getStandardCompletions(prefix);

    if (!code || this.inFlight) {
      // Return immediately with what we have while a request is already running
      callback(null, [...standard, ...this.lastResults]);
      return;
    }

    this.inFlight = true;
    this.connection
      .compute(code, pos.row, pos.column)
      .then((results) => {
        this.inFlight = false;
        this.lastResults = results;
        callback(null, [...standard, ...results]);
      })
      .catch(() => {
        this.inFlight = false;
        callback(null, standard);
      });
  }
}
