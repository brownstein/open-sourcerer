import { Button } from "@mui/material";

import { CodeExplainer } from "../code/CodeExplainer";
import { celebrationSingleton } from "../ui/celebration/CelebrationController";
import { TabSelectorHexTiles } from "../ui/tab-selector/TabSelector";
import "./ComponentDebug.css";

export function ComponentDebugTab() {
  return (
    <div className="component-debug-tab-container">
      <div className="component-debug-content">
        <p>=== Code Explainer Below ===</p>
        <CodeExplainer
          tokenExplanations={{
            some_string:
              "The some_string variable stores a string in this example."
          }}
        >
          {`
              // This is a comment line.
              function logNumber(i) {
                console.log({
                  number: i
                });
              }
              for (let i = 0; i < 100; i++) {
                logNumber(i);
              }
              `}
        </CodeExplainer>
        <p>=== Code Explainer Above ===</p>
        <Button
          onClick={() => {
            celebrationSingleton.celebrate({
              type: "achievement",
              icon: "editor",
              content: "CSS for days."
            });
          }}
        >
          Celebrate
        </Button>
      </div>
    </div>
  );
}
