/**
 * Non-TS shim for Ace Edtior
 *
 * We need to use Webpack's import directives here in order to specify the
 * loader type and configuration, as well as manage the order in which things
 * are imported. React-ace does some checking around on import, so we have to
 * configure the environment first.
 */

// pull in Ace and configure it
import Ace from "ace-builds/src-noconflict/ace";
import jsWorkerUrl from "file-loader?name=mode-javascript.worker.js!ace-builds/src-noconflict/worker-javascript";
import langTools from "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/snippets/javascript";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-tomorrow";

Ace.config.setModuleUrl(
  "ace/mode/javascript_worker",
  jsWorkerUrl
);

window.ace = Ace;

// pull in Ace editor React component
// eslint-disable-next-line import/first
import AceEditor from "react-ace";

export default function AceShim(props) {
  return <AceEditor
    mode="javascript"
    theme="tomorrow"
    {...props}
    />;
}

export { langTools };
