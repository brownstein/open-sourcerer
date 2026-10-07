import { Tutorial } from "src/api/tutorials";
import { ComponentConfigType } from "src/components/ui/config/types";
import { selectViewedPercentageForDoc } from "src/redux/progression/selectors";
import { selectComponentConfigsByComponentName, selectLayoutTabsByComponentName } from "src/redux/ui/selectors";

export const T000AimSpell = {
  id: "T000AimSpell" as const,
  name: () => "Aim a Spell",
  steps: [
    {
      content: () => "Open the documentation.",
      isDone: (ctx) => selectLayoutTabsByComponentName(ctx.state).has("docs"),
      pointTo: () => ({
        nearestElement:
          document.querySelectorAll<HTMLElement>("#dock-item-docs")
      })
    },
    {
      content: () => "Open the Projectile documentation.",
      pointTo: () => ({
        firstElement: [
          document.querySelector<HTMLElement>("#docs-link-spell-api-guides_index"),
          document.querySelector<HTMLElement>("#docs-link-spell-api-guides_projectile-api-guide")
        ]
      }),
      shadowBox: true,
      highlightPadding: 16,
      isDone: (ctx) => {
        const docsTabStates = selectComponentConfigsByComponentName(ctx.state)[
          "docs"
        ];
        for (const [_tabId, rawTabState] of docsTabStates) {
          const docsState = rawTabState as ComponentConfigType<"docs">;
          if (docsState.docId === "spell-api-guides/projectile-api-guide") return true;
        }
        return false;
      }
    },
    {
      content: () => "Read the documentation to learn how to aim projectiles.",
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>(".docs-tab")
      }),
      isDoneFraction: (ctx) => {
        return selectViewedPercentageForDoc(ctx.state, "spell-api-guides/projectile-api-guide");
      },
    },
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
      content: () =>
        "Use what you have learned to make a Projecile that can hit the switch.",
      pointTo: () => ({
        element: document.querySelector<HTMLDivElement>(
          ".code-editor-text-editor"
        )
      }),
      isDone: (ctx) => {
        // Just listen for the channel activation that means we hit the switch.
        return !!ctx.level?.state.getValue("B");
      }
    }
  ]
} satisfies Tutorial;
