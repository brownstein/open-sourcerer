import { Tutorial } from "src/api/tutorials";
import { selectLayoutTabsByComponentName } from "src/redux/ui/selectors";

export const T001CleanupUI = {
  id: "T001CleanupUI" as const,
  name: () => "Clean up the UI",
  steps: [
    {
      content: () => "The view's a bit messy now - let's clean up some tabs.",
    },
    {
      content: () => "First things first, you can always resize tabs using the divider between screen areas.",
      pointTo: () => ({
        element: document.querySelector<HTMLElement>(".flexlayout__splitter")
      })
    },
    {
      content: () => "Now let's close all the extra tabs",
      pointTo: () => ({
        firstElement: document.querySelectorAll<HTMLElement>(".flexlayout__tab_button_trailing")
      }),
      isDone: ({ state }) => {
        const tabs = selectLayoutTabsByComponentName(state);
        return tabs.size === 1 && tabs.keys().next().value === "viewport";
      }
    }
  ]
} satisfies Tutorial;