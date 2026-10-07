import * as acorn from "acorn";

import {
  Tutorial,
  TutorialEvaluationContext,
  TutorialStep
} from "src/api/tutorials";
import { ComponentConfigType } from "src/components/ui/config/types";
import { selectViewedPercentageForDoc } from "src/redux/progression/selectors";
import { selectAllScriptEditors } from "src/redux/scriptEditor/selectors";
import {
  selectComponentConfigsByComponentName,
  selectLayoutTabsByComponentName
} from "src/redux/ui/selectors";
import { recurseIntoAcornProgram } from "src/util/acornUtills";

function ctxCheckHelloWorldInEditor(ctx: TutorialEvaluationContext) {
  const editors = selectAllScriptEditors(ctx.state);
  const componentDefs = selectComponentConfigsByComponentName(ctx.state)[
    "codeEditor"
  ];
  for (const editor of editors) {
    if (
      !componentDefs?.some(
        ([id, def]) =>
          (def as ComponentConfigType<"codeEditor">)?.editorId === editor.id
      )
    )
      continue;
    const code = editor.code;
    if (!code) continue;
    let helloWorldFound = false;
    try {
      const parsed = acorn.parse(code, { ecmaVersion: 6 });
      recurseIntoAcornProgram((node) => {
        if (node.type !== "CallExpression") return;
        if (node.callee.type !== "MemberExpression") return;
        if (node.callee.object.type !== "Identifier") return;
        if (node.callee.object.name !== "console") return;
        if (node.callee.property.type !== "Identifier") return;
        if (node.callee.property.name !== "log") return;
        const arg = node.arguments.at(0);
        if (arg?.type !== "Literal") return;
        if (
          typeof arg.value === "string" &&
          arg.value.toLowerCase() === "hello world"
        ) {
          helloWorldFound = true;
        }
      }, parsed);
      if (helloWorldFound) return true;
    } catch (err) {
      return false;
    }
  }
  return false;
}

export const T001RunHelloWorld = {
  id: "T001RunHelloWorld" as const,
  name: () => "Run Hello World",
  steps: [
    {
      content: () => "Open the code editor",
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>("#dock-item-codeEditor")
      }),
      shadowBox: true,
      isDone: (ctx) => {
        return selectLayoutTabsByComponentName(ctx.state).has("codeEditor");
      }
    },
    {
      content: () => "Open the documentation",
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>("#dock-item-docs")
      }),
      shadowBox: true,
      isDone: (ctx) => {
        return selectLayoutTabsByComponentName(ctx.state).has("docs");
      }
    },
    {
      content: () => 'Open the tutorials.',
      pointTo: () => ({
        element: document.querySelector<HTMLElement>(
          ".doc-nav-tile.tutorials"
        )
      }),
      isDone: (ctx) => {
        const docsTabStates = selectComponentConfigsByComponentName(ctx.state)[
          "docs"
        ];
        for (const [_tabId, rawTabState] of docsTabStates) {
          const docsState = rawTabState as ComponentConfigType<"docs">;
          if (docsState.docId === "tutorials/index") return true;
        }
        return false;
      }
    },
    {
      content: () => 'Open the "Getting Started" document',
      pointTo: () => ({
        element: document.querySelector<HTMLElement>(
          ".doc-nav-tile.tutorials_read-this-first"
        )
      }),
      shadowBox: true,
      highlightPadding: 16,
      isDone: (ctx) => {
        const docsTabStates = selectComponentConfigsByComponentName(ctx.state)[
          "docs"
        ];
        for (const [_tabId, rawTabState] of docsTabStates) {
          const docsState = rawTabState as ComponentConfigType<"docs">;
          if (docsState.docId === "tutorials/read-this-first") return true;
        }
        return false;
      }
    },
    {
      content: () => (
        <>
          <p>This doc will grant you great power, but only if you read it.</p>
          <p>
            Alternatively, just type the following into the code editor in the
            next step:
          </p>
          <pre>
            <code>console.log("hello world");</code>
          </pre>
          <p>
            You'll be using this a lot so it's good to build the memory from
            actually typing it.
          </p>
        </>
      ),
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>(".docs-tab")
      }),
      shadowBox: false,
      enableSkip: true,
      isDoneFraction: (ctx) => {
        const state = ctx.state;
        const scrollState = selectViewedPercentageForDoc(
          state,
          "tutorials/read-this-first"
        );
        return scrollState * 2;
      }
    },
    {
      content: () =>
        'Write a spell that logs "hello world" based on what you\'ve learned',
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>(
          ".code-editor-text-editor"
        )
      }),
      isDone: ctxCheckHelloWorldInEditor
    },
    {
      content: () => "Run the code",
      pointTo: () => ({
        element: document.querySelector<HTMLElement>("#code-editor-run-button")
      }),
      isDone: (ctx) => {
        return (
          ctx?.spells?.sharedConsoleOutput.some(
            (v) =>
              typeof v.primitiveValue === "string" &&
              v.primitiveValue.toLowerCase() === "hello world"
          ) ?? false
        );
      },
      shouldRegress: (ctx) => !ctxCheckHelloWorldInEditor(ctx)
    } satisfies TutorialStep,
    {
      content: () => "Observe the result in the JavaScript console",
      pointTo: () => {
        return {
          element: document.querySelector<HTMLElement>(".console-lines")
        };
      }
    }
  ]
} satisfies Tutorial;
