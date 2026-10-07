import cx from "classnames";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { useTabComponenents } from "src/components/context/UIRenderingContext";
import { DefaultComponentDefinitionNames } from "src/components/ui/root/componentRegistry";
import { mutateLayout } from "src/engine/util/tabHelpers";
import { IVector2 } from "src/engine/util/vecTypes";
import { useAppStore } from "src/redux/hooks";
import { isDevMode } from "src/util/devUtil";

import { Icon } from "../icons/Icon";
import "./TabSelector.css";

export const mainTabSelectorRows: DefaultComponentDefinitionNames[][] = [
  ["codeEditor"],
  ["docs", "inventory", "questLog"],
  ["skillTree", "settings"]
];

export const devTabSelectorRows: DefaultComponentDefinitionNames[][] = [
  ["codingChallenge", "componentDebug", "visualizer"],
  ["levelSelector", "levelEditor", "debug"]
];

const devTabNameSet = new Set<DefaultComponentDefinitionNames>();
for (const row of devTabSelectorRows) {
  for (const componentName of row) {
    devTabNameSet.add(componentName);
  }
}

type HexContentWithPosition<T> = {
  content: T;
  position: IVector2;
};

function layoutHex<T>(
  content: T[][],
  radius: number
): HexContentWithPosition<T>[] {
  const result: HexContentWithPosition<T>[] = [];
  const firstRowIsSingleton = content.at(0)?.length === 1;
  const columns = Math.max(...content.map((c) => c.length));
  const ox = Math.floor(radius * Math.cos(Math.PI / 6));
  const oy = radius;
  const dy = radius * 2;
  let primaryStart = 0;
  if (firstRowIsSingleton) {
    primaryStart = 1;
    const x = Math.floor(columns / 2) * ox * 2;
    const y = 0;
    const tileContent = content.at(0)?.at(0);
    if (!tileContent)
      throw new Error("Broken invariant; tiles not present as expected.");
    result.push({
      content: tileContent,
      position: {
        x,
        y
      }
    });
  }
  for (let r = primaryStart; r < content.length; r++) {
    const row = content.at(r);
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const tileContent = row.at(c);
      if (!tileContent) continue;
      const x = ox * c * 2;
      const y = dy * r + oy * (c % 2 ? 0 : -1);
      result.push({
        content: tileContent,
        position: {
          x,
          y
        }
      });
    }
  }
  return result;
}

export type TabSelectorHexTileProps = {
  componentName: DefaultComponentDefinitionNames;
  position: IVector2;
  tabSetId?: string;
  onClick?: () => void;
};

export function TabSelectorHexTile(props: TabSelectorHexTileProps) {
  const { componentName, position, tabSetId, onClick: onClickProp } = props;
  const store = useAppStore();
  const { t } = useTranslation();
  const tabComponents = useTabComponenents();
  const tabComponentDef = tabComponents[componentName];
  const [isMouseOver, setIsMouseOver] = useState(false);

  const onClickPropRef = useRef(onClickProp);
  onClickPropRef.current = onClickProp;

  const onClick = useCallback(() => {
    if (!tabSetId || tabSetId === "viewport") {
      mutateLayout(store, tabSetId ?? "viewport")
        .openTab({
          componentName,
          relativePosition: "bottom",
          duration: 500
        })
        .apply();
      onClickPropRef.current?.();
    } else {
      mutateLayout(store, tabSetId)
        .openTab({
          componentName,
          relativePosition: "shared",
          duration: 500
        })
        .apply();
      onClickPropRef.current?.();
    }
  }, [store, componentName, tabSetId]);

  if (tabComponentDef === null) return null;
  return (
    <div
      className={cx("tab-selector-hex-tile-wrapper", {
        "is-dev": devTabNameSet.has(componentName)
      })}
      onClick={onClick}
      onMouseEnter={() => setIsMouseOver(true)}
      onMouseLeave={() => setIsMouseOver(false)}
      style={{
        top: position.y,
        left: position.x
      }}
    >
      <Popover
        isOpen={isMouseOver}
        padding={8}
        positions={["bottom", "top"]}
        content={(cProps) => (
          <ArrowContainer
            childRect={cProps.childRect}
            popoverRect={cProps.popoverRect}
            position={cProps.position}
            arrowSize={8}
            arrowColor="#000000"
          >
            <div className="component-tile-popover">
              {tabComponentDef.displayName(t)}
            </div>
          </ArrowContainer>
        )}
      >
        <div
          className={cx("tab-selector-hex-tile", {
            "is-dev": devTabNameSet.has(componentName)
          })}
          data-testid={`component-tile-${componentName}`}
          onClick={() => {}}
          onMouseEnter={() => setIsMouseOver(true)}
          onMouseLeave={() => setIsMouseOver(false)}
        >
          <div className="tab-selector-hex-tile-inner">
            <div className={`tab-component-icon icon-${componentName}`} />
          </div>
        </div>
      </Popover>
    </div>
  );
}

export type TabSelectorHexTilesProps = {
  tabSetId?: string;
  onClickAny?: () => void;
};

export function TabSelectorHexTiles(props: TabSelectorHexTilesProps) {
  const { tabSetId, onClickAny } = props;
  const devMode = isDevMode();
  const allTiles = useMemo(
    () =>
      devMode
        ? [...mainTabSelectorRows, ...devTabSelectorRows]
        : mainTabSelectorRows,
    [devMode]
  );

  const tileLayout = useMemo(() => layoutHex(allTiles, 52), [allTiles]);

  return (
    <div
      className="tab-selector-hex-layout"
      style={{
        width: 52 * 5.7,
        height: 43 * tileLayout.length
      }}
    >
      {tileLayout.map((tile, n) => (
        <TabSelectorHexTile
          key={n}
          componentName={tile.content}
          position={tile.position}
          tabSetId={tabSetId}
          onClick={onClickAny}
        />
      ))}
    </div>
  );
}

export type AddTabHexButtonProps = {
  tabSetId: string;
  isFiller?: boolean;
};

export function AddTabHexButton(props: AddTabHexButtonProps) {
  const { tabSetId, isFiller } = props;
  const [isOpen, setIsOpen] = useState(false);

  const onClickAny = useCallback(() => setIsOpen(false), []);

  return (
    <Popover
      isOpen={isOpen}
      padding={20}
      positions={["bottom", "top", "left", "right"]}
      align="center"
      onClickOutside={() => setIsOpen(false)}
      content={(pProps) => (
        <ArrowContainer
          childRect={pProps.childRect}
          position={pProps.position}
          popoverRect={pProps.popoverRect}
          arrowSize={20}
          arrowColor="rgba(5, 10, 15, 0.5)"
        >
          <TabSelectorHexTiles tabSetId={tabSetId} onClickAny={onClickAny} />
        </ArrowContainer>
      )}
    >
      {isFiller ? (
        <div className="add-tab-zone" onClick={() => setIsOpen((o) => !o)} />
      ) : (
        <div
          className="add-tab-button flexlayout__tab_button flexLayout__tab_button_top"
          data-testid="add-tab-button"
          onClick={() => setIsOpen((o) => !o)}
        >
          <Icon icon="addTabFilled" size="fill" />
        </div>
      )}
    </Popover>
  );
}
