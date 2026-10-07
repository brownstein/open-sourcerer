import { ReactNode } from "react";

import { DefinitionDocId, getDefinitionDoc } from "src/docs/allDefinitions";
import {
  DEFINITION_DOC_ID_PREFIX,
  FALLBACK_LOCALE
} from "src/docs/configuration";
import { DocId, LocaleCode } from "src/docs/indexedDocs/docTypes";
import { mdxComponents } from "src/docs/mdxComponents";
import { useAppSelector } from "src/redux/hooks";

import { DocLink } from "../DocLink/DocLink";
import { DocTooltip } from "../DocTooltip/DocTooltip";
import "./Definition.less";

const MISSING_DEFINITION_LABEL = "Definition Label Missing";

export type DefinitionProps = {
  term: DefinitionDocId;
  children?: ReactNode;
};

export function Definition({ term, children }: DefinitionProps) {
  const locale = useAppSelector(
    (state) => (state.settings.language || FALLBACK_LOCALE) as LocaleCode
  );

  const definitionDoc = getDefinitionDoc(term, locale);
  const label =
    children ?? definitionDoc?.meta.title ?? MISSING_DEFINITION_LABEL;

  if (!definitionDoc) {
    return <>{label}</>;
  }

  const DefinitionContent = definitionDoc.component;
  const internalDocId = `${DEFINITION_DOC_ID_PREFIX}${term}` as DocId;

  return (
    <DocTooltip
      tooltip={<DefinitionContent components={mdxComponents} />}
      focusable={false}
    >
      <DocLink href={internalDocId}>{label}</DocLink>
    </DocTooltip>
  );
}
