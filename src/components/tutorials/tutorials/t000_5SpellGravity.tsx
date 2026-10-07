import { Box } from "@mui/material";

import { Tutorial } from "src/api/tutorials";
import { useDocViewPercentage } from "src/docs/components/hooks/useDocViewPercentage";
import { useHasDocBeenFullyViewed } from "src/docs/components/hooks/useHasDocBeenFullyViewed";
import { DocId } from "src/docs/indexedDocs/docTypes";
import { mdxComponents } from "src/docs/mdxComponents";
import { validateDocAnchor } from "src/docs/util";
import { selectHasDocBeenFullyViewed } from "src/redux/progression/selectors";
import { selectAllScriptEditors } from "src/redux/scriptEditor/selectors";
import { selectAllScripts } from "src/redux/scriptLibrary/selectors";
import { selectLayoutTabsByComponentName } from "src/redux/ui/selectors";

export const T000_5SpellGravity = {
  id: "T000_5SpellGravity" as const,
  name: () => "Disabling Spell Gravity",
  steps: [
    {
      content: () => "Once more, open the documentation.",
      isDone: (ctx) => selectLayoutTabsByComponentName(ctx.state).has("docs"),
      pointTo: () => ({
        nearestElement:
          document.querySelectorAll<HTMLElement>("#dock-item-docs")
      })
    },
    {
      content: () => {
        const projectileApiGuideId: DocId =
          "spell-api-guides/projectile-api-guide";
        const hasDocBeenFullyViewed =
          useHasDocBeenFullyViewed(projectileApiGuideId);
        const docViewedPercentage = useDocViewPercentage(projectileApiGuideId);

        const finalPercentageString = hasDocBeenFullyViewed
          ? "100%"
          : `${+(docViewedPercentage * 100).toFixed(2)}%`;

        return (
          <Box>
            <mdxComponents.p>
              Navigation in the documentation has now been{" "}
              <mdxComponents.mark>unlocked</mdxComponents.mark>! You may explore
              to your heart's content, especially taking note of the{" "}
              <strong>navbar</strong> at the top.
            </mdxComponents.p>
            <br />
            <mdxComponents.p>
              When you are ready, try to find your way back to the{" "}
              <strong>
                <em>"Projectile API Guide"</em>
              </strong>{" "}
              - there is now more unlocked knowledge that will be key to solving
              this challenge.
            </mdxComponents.p>
            <mdxComponents.hr />
            <mdxComponents.h3>
              Viewed:
              <mdxComponents.mark>{finalPercentageString}</mdxComponents.mark>
            </mdxComponents.h3>
          </Box>
        );
      },
      isDone: (ctx) => {
        const projectileApiGuideId: DocId =
          "spell-api-guides/projectile-api-guide";
        const hasDocBeenFullyViewed = selectHasDocBeenFullyViewed(
          ctx.state,
          projectileApiGuideId
        );

        return hasDocBeenFullyViewed;
      },
      // pointTo: () => ({
      //   nearestElement: document.querySelectorAll<HTMLElement>(
      //     `#${validateDocAnchor("index", "gravity-tutorial-arrow-marker")}`
      //   )
      // })
    },
    {
      content: () =>
        "Use what you have learned to make a Projectile that can hit the switch.",
      isDone: (ctx) => {
        for (const spell of selectAllScripts(ctx.state)) {
          if (spell.code.match(/Projectile({.*\"?gravity\"?:\s*0.*})/))
            return true;
        }
        // This is a kludge.
        for (const _spellCtx of Object.values(
          ctx.spells?.getSpellCtxs() ?? {}
        )) {
          return true;
        }
        return false;
      }
    }
    // {
    //   content: () => "Click the load button to load an existing spell.",
    //   isDone: (ctx) => {
    //     for (const editor of selectAllScriptEditors(ctx.state)) {
    //       if (editor.savedSpellSnapshot?.id) return true;
    //     }
    //     return false;
    //   },
    //   pointTo: () => ({
    //     nearestElement: document.querySelectorAll<HTMLElement>(
    //       "#editor-load-button"
    //     )
    //   })
    // },
    // {
    //   content: () => (
    //     <div>
    //       <p>
    //         Modify your spell. In the case of projectile spells, add a gravity
    //         parameter set to 0 to turn off the gravity.
    //       </p>
    //       <pre>{"Projectile({ gravity: 0 });"}</pre>
    //       <p>
    //         You can combine multiple parameters in spell constructor object
    //         arguments by separating them with a comma.
    //       </p>
    //       <pre>{"Projectile({ aim: 0, gravity: 0 });"}</pre>
    //     </div>
    //   ),
    //   isDone: (ctx) => {
    //     for (const editor of selectAllScriptEditors(ctx.state)) {
    //       if (
    //         editor.code?.replaceAll(" ", "").match(/{.*\"?gravity\"?:\s*0.*}/)
    //       )
    //         return true;
    //     }
    //     return false;
    //   }
    // },
    // {
    //   content: () => "Either run the spell directly or save it",
    //   isDone: (ctx) => {
    //     for (const spell of selectAllScripts(ctx.state)) {
    //       if (spell.code.match(/Projectile({.*\"?gravity\"?:\s*0.*})/))
    //         return true;
    //     }
    //     // This is a kludge.
    //     for (const _spellCtx of Object.values(
    //       ctx.spells?.getSpellCtxs() ?? {}
    //     )) {
    //       return true;
    //     }
    //     return false;
    //   }
    // }
  ]
} satisfies Tutorial;
