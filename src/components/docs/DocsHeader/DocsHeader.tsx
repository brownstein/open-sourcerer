import { Box, Divider } from "@mui/material";
import { useState } from "react";

import { useHasCompletedTutorial } from "src/docs/components/hooks/useHasCompletedTutorial";
import { DocId, LocaleCode } from "src/docs/indexedDocs/docTypes";

import { DocsBreadcrumbs } from "./DocsBreadcrumbs/DocsBreadcrumbs";
import "./DocsHeader.less";
import { DocsHomeButton } from "./DocsHomeButton/DocsHomeButton";
import { DocsPageHistoryNavigator } from "./DocsPageHistoryNavigator/DocsPageHistoryNavigator";
import { DocsSearch } from "./DocsSearch/DocsSearch";

export type DocsHeaderProps = {
  docId: DocId;
  locale: LocaleCode;
  query: string;
  setQuery: (query: string) => void;
  onBackwardsNav: () => void;
  onForwardsNav: () => void;
  onBackwardsHighlightNav: () => void;
  onForwardsHighlightNav: () => void;
  canBackwardsNav: boolean;
  canForwardsNav: boolean;
};

export function DocsHeader(props: DocsHeaderProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  return (
    <Box className="docs-header-container">
      <Box
        className="docs-header"
        sx={{
          bgcolor: "background.default",
          color: "text.primary"
        }}
      >
        <Box
          className="docs-header-cell docs-header-cell-left"
          inert={isSearchExpanded}
        >
          <DocsPageHistoryNavigator
            onBackwardsNav={props.onBackwardsNav}
            onForwardsNav={props.onForwardsNav}
            canBackwardsNav={props.canBackwardsNav}
            canForwardsNav={props.canForwardsNav}
          />
          <DocsHomeButton />
        </Box>

        <Box
          className="docs-header-cell docs-header-cell-middle"
          inert={isSearchExpanded}
        >
          <DocsBreadcrumbs docId={props.docId} locale={props.locale} />
        </Box>

        <Box
          className="docs-header-cell docs-header-cell-balance"
          inert={isSearchExpanded}
        />

        <DocsSearch
          locale={props.locale}
          onExpansionChange={setIsSearchExpanded}
          query={props.query}
          setQuery={props.setQuery}
          onBackwardsHighlightNav={props.onBackwardsHighlightNav}
          onForwardsHighlightNav={props.onForwardsHighlightNav}
        />
      </Box>
      <Divider />
    </Box>
  );
}
