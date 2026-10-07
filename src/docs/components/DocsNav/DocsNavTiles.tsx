import cx from "classnames";
import { Children, useCallback, useMemo } from "react";

import { DocId } from "src/docs/indexedDocs/docTypes";
import { openDocAt } from "src/redux/docsNav/slice";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectUnreadDocsWithKeyNesting } from "src/redux/progression/selectors";

import "./DocsNavTiles.css";

export type DocNavTileProps = {
  icon?: React.ReactNode;
  children?: React.ReactElement | React.ReactElement[];
  docId: DocId;
};

export function DocNavTile(props: DocNavTileProps) {
  const { icon, children, docId } = props;
  const dispatch = useAppDispatch();
  const unreadContent = useAppSelector(selectUnreadDocsWithKeyNesting);

  const newContentCount = useMemo(() => {
    let baseDocId: string = docId;
    if (docId.endsWith("/index")) {
      baseDocId = baseDocId.slice(0, -6);
    }
    if (unreadContent.has(baseDocId))
      return unreadContent.get(baseDocId)?.length ?? 0;
    return 0;
  }, [docId, unreadContent]);

  const onClick = useCallback(() => {
    dispatch(openDocAt({ docId }));
  }, [dispatch, docId]);

  return (
    <div
      className={cx("doc-nav-tile", docId.replaceAll(/\//g, "_"))}
      onClick={onClick}
    >
      <div className="doc-nav-tile-background" />
      <div className="doc-nav-tile-icon-and-content">
        <div className="doc-nav-tile-icon">{icon}</div>
        <div className="doc-nav-tile-content">{children}</div>
      </div>
      {newContentCount ? (
        <div className="doc-nav-tile-new-content-count">{newContentCount}</div>
      ) : null}
    </div>
  );
}

export type DocNavListItemProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  isUpdated?: boolean;
};

export function DocNavListItem(props: DocNavListItemProps) {
  const { icon, title, subtitle, isUpdated } = props;
  return (
    <div className="doc-nav-list-item">
      <div className="doc-nav-list-item-icon">{icon}</div>
      <div className="doc-nav-list-item-content">
        <h4>{title}</h4>
        <div className="subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

export type DocNavListProps = {};

export function DocNavList(props: DocNavListProps) {
  return (
    <div className="doc-nav-list">
      <div className="doc-nav-tile-background low-opacity" />
    </div>
  );
}

export type DocNavTileGridProps = {
  children: React.ReactElement | React.ReactElement[];
};

export function DocNavTileGrid(props: DocNavTileGridProps) {
  const { children } = props;
  return (
    <div className="doc-nav-tile-grid">
      {Children.map(children, (child, index) => (
        <div className="doc-nav-tile-grid-tile" key={index}>
          <div className="doc-nav-tile-grid-tile-background" />
          {child}
        </div>
      ))}
    </div>
  );
}
