import { Box, Breadcrumbs, Link, Typography } from "@mui/material";

import { Icon } from "src/components/ui/icons/Icon";
import { getDoc } from "src/docs/allDocs";
import { DocId, LocaleCode } from "src/docs/indexedDocs/docTypes";
import { openDocAt } from "src/redux/docsNav/slice";
import { useAppDispatch } from "src/redux/hooks";

import "./DocsBreadcrumbs.less";

export type DocsBreadcrumbsProps = {
  docId: DocId;
  locale: LocaleCode;
};

export function DocsBreadcrumbs(props: DocsBreadcrumbsProps) {
  const dispatch = useAppDispatch();
  const docEntry = getDoc(props.docId, props.locale);

  const title = docEntry?.meta.title ?? "";
  const categories = docEntry?.meta.categories ?? [];

  const hasCategories = categories.length > 0;

  const separator = (
    <Box
      className="docs-breadcrumbs-separator"
      component="span"
      sx={{ color: "text.disabled" }}
    >
      <Icon icon="chevronRight" size="font" />
    </Box>
  );

  return (
    <Box className="docs-breadcrumbs" data-has-categories={hasCategories}>
      <Breadcrumbs className="docs-breadcrumbs-trail" separator={separator}>
        {categories.map((category) => (
          <Link
            className="docs-breadcrumbs-category"
            key={category.indexDocId + category.label}
            component="button"
            type="button"
            underline="hover"
            color="text.secondary"
            variant="body2"
            onClick={() => dispatch(openDocAt({ docId: category.indexDocId }))}
          >
            {category.label}
          </Link>
        ))}

        <Typography
          className="docs-breadcrumbs-title"
          variant="body2"
          color="text.primary"
          component="span"
        >
          {title}
        </Typography>
      </Breadcrumbs>
    </Box>
  );
}
