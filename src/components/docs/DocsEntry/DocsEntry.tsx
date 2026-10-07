import { Alert, Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { MDXComponents } from "mdx/types";
import { memo, useEffect, useRef, useState } from "react";

import { Icon } from "src/components/ui/icons/Icon";
import { getDoc } from "src/docs/allDocs";
import { DocsBanner } from "src/docs/components/DocsBanner/DocsBanner";
import { DocId, LocaleCode } from "src/docs/indexedDocs/docTypes";
import { mdxComponents } from "src/docs/mdxComponents";
import { useAppSelector } from "src/redux/hooks";
import { selectIsDocUnlocked } from "src/redux/progression/selectors";

import { PhraseSearchHighlighter } from "../../util/PhraseSearchHighlighter/PhraseSearchHighlighter";
import "./DocsEntry.less";

export type DocsEntryProps = {
  docId: DocId;
  locale: LocaleCode;
  anchorId?: string;
  components?: MDXComponents;

  // NOTE: scroll effect is keyed on this so it still happens even if same navigation request is spammed
  navigationRequestId?: string;

  highlightQuery: string;
  setForwardsNavHighlightHandler: (cb: () => void) => void;
  setBackwardsNavHighlightHandler: (cb: () => void) => void;
  highlightNavIndex?: number;
  setHighlightNavIndex?: (index: number) => void;
};

function DocsEntryInner(props: DocsEntryProps) {
  const articleContainerRef = useRef<HTMLElement>(null);

  const isDocUnlocked = useAppSelector((state) =>
    selectIsDocUnlocked(state, props.docId)
  );

  const [navTargetHeader, setNavTargetHeader] = useState<
    HTMLElement | undefined
  >(undefined);

  useEffect(() => {
    if (!props.navigationRequestId) return;
    if (!props.anchorId) return;

    const articleContainerElem = articleContainerRef.current;
    if (!articleContainerElem) return;

    const targetElement = articleContainerElem.querySelector<HTMLElement>(
      `#${CSS.escape(props.anchorId)}`
    );
    if (!targetElement) return;

    setNavTargetHeader(targetElement);
  }, [props.navigationRequestId, props.anchorId, props.docId, props.locale]);

  const docEntry = getDoc(props.docId, props.locale);

  if (!docEntry) {
    return (
      <Box className="docs-entry-missing">
        <Alert severity="warning" variant="outlined">
          Document not found: <code>{props.docId}</code>
        </Alert>
      </Box>
    );
  }

  const docMeta = docEntry.meta;
  const isLocked = docMeta.isUnlockable && !isDocUnlocked;

  if (isLocked) {
    return (
      <Box className="docs-entry-missing">
        <Alert severity="info" variant="outlined">
          Document is locked: <code>{props.docId}</code>
        </Alert>
      </Box>
    );
  }

  const DocComponent = docEntry.component;
  const bannerImage = docMeta.bannerImage && (
    <DocsBanner src={docMeta.bannerImage} />
  );
  let titleContent: React.ReactNode;
  if (docMeta.title || docMeta.subtitle) {
    titleContent = (
      <div className="doc-title">
        <h2>
          {docMeta.iconName && <Icon className="title-icon" icon={docMeta.iconName} size="font" />}
          {docMeta.title}
        </h2>
        <div className="subtitle">{docMeta.subtitle}</div>
      </div>
    );
  }

  return (
    <PhraseSearchHighlighter
      query={props.highlightQuery}
      highlightKey="docs-entry-highlight"
      focusedHighlightKey="docs-entry-focused-highlight"
      focusNearestMatchBelowElementOnNextSearch={navTargetHeader}
      setHighlightBackwardsNavHandler={props.setBackwardsNavHighlightHandler}
      setHighlightForwardsNavHandler={props.setForwardsNavHighlightHandler}
      focusedHighlightIndex={props.highlightNavIndex}
      setFocusedHighlightIndex={props.setHighlightNavIndex}
    >
      <Box
        ref={articleContainerRef}
        component="article"
        className="docs-entry"
        sx={{
          color: "text.primary",
          "& > pre": {
            border: 1,
            borderColor: "divider",
            bgcolor: (theme) =>
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.04)
                : alpha(theme.palette.common.black, 0.04)
          },
          "& :not(pre) > code": {
            bgcolor: (theme) =>
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.08)
                : alpha(theme.palette.common.black, 0.06)
          },
          "& blockquote": {
            borderColor: "divider",
            color: "text.secondary"
          }
        }}
      >
        {bannerImage}
        {titleContent}
        <DocComponent components={props.components ?? mdxComponents} />
      </Box>
    </PhraseSearchHighlighter>
  );
}

export const DocsEntry = memo(DocsEntryInner);
