import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode,
  useCallback
} from "react";

import {
  extractTutorialReference,
  isDocId,
  isTutorialReference
} from "src/docs/allDocs";
import { DocId } from "src/docs/indexedDocs/docTypes";
import { openDocAt } from "src/redux/docsNav/slice";
import { useAppDispatch } from "src/redux/hooks";
import { startTutorial } from "src/redux/ui/slice";

import { useHasCompletedTutorial } from "../hooks/useHasCompletedTutorial";
import "./DocLink.less";

type ForwardedAnchorProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children" | "onClick" | "target" | "rel"
>;

export type DocLinkProps = {
  href?: string;
  children?: ReactNode;
} & ForwardedAnchorProps;

export function DocLink({ href, children, ...anchorProps }: DocLinkProps) {
  const dispatch = useAppDispatch();
  const isInternal = href !== undefined && isDocId(href);
  const isTutorialLink = href !== undefined && isTutorialReference(href);

  const handleInternalClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (isInternal) {
        dispatch(openDocAt({ docId: href }));
        return;
      }
      if (isTutorialLink) {
        dispatch(startTutorial(extractTutorialReference(href)));
        return;
      }
    },
    [dispatch, href, isInternal, isTutorialLink]
  );

  if (isInternal || isTutorialLink) {
    return (
      <Box
        component="a"
        className="doc-link"
        href={`#${href}`} // <-- TODO: for anchor functionalities
        // This is used by tutorials as an ID reference.
        id={`docs-link-${href.replaceAll(/[\/\.]/g, "_")}`}
        onClick={handleInternalClick}
        sx={{
          backgroundImage: (theme) => {
            const color = alpha(theme.palette.secondary.main, 0.85);
            return `linear-gradient(${color}, ${color})`;
          }
        }}
        {...anchorProps}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="a"
      className="doc-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        backgroundImage: (theme) => {
          const color = alpha(theme.palette.primary.main, 0.85);
          return `linear-gradient(${color}, ${color})`;
        }
      }}
      {...anchorProps}
    >
      {children}
    </Box>
  );
}
