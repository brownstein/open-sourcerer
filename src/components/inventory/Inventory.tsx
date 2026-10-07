import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { useMeasureSize } from "src/components/util/useMeasureSize";
import { Icon } from "src/components/ui/icons/Icon";
import { HotKeyRow } from "src/components/ui/item/HotKeyRow";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  selectHotKeyCurrentRow,
  selectHotKeyRowCount
} from "src/redux/inventory/selectors";
import { setHotKeyCurrentRow } from "src/redux/inventory/slice";

import { CharacterItems } from "./CharacterItems";
import "./Inventory.less";
import { ItemBrowser } from "./ItemBrowser";

export type InventoryProps = {};

export function Inventory(props: InventoryProps) {
  const dispatch = useAppDispatch();
  const row = useAppSelector(selectHotKeyCurrentRow);
  const rowCount = useAppSelector(selectHotKeyRowCount);
  const [wide, setWide] = useState(false);
  const [measureRef, rect] = useMeasureSize();

  const nextRow = () => dispatch(setHotKeyCurrentRow((row + 1) % rowCount));
  const prevRow = () =>
    dispatch(setHotKeyCurrentRow((row + rowCount - 1) % rowCount));

  useLayoutEffect(() => {
    setWide(rect.height * 1.25 < rect.width);
  }, [rect]);

  return (
    <div className={cx("inventory-layout", wide && "wide")} ref={measureRef}>
      <div className="first-container">
        <CharacterItems />
        <div className="gem-section">
          <div className="separator"></div>
          <div className="gems">
            <div className="gem">
              <Icon icon="currencyA" size="font" className="gem-a" />0
            </div>
            <div className="gem">
              <Icon icon="currencyB" size="font" className="gem-b" />0
            </div>
            <div className="gem">
              <Icon icon="currencyC" size="font" className="gem-c" />0
            </div>
            <div className="gem">
              <Icon icon="currencyD" size="font" className="gem-d" />0
            </div>
          </div>
        </div>
        <div className="hotbar-section">
          {rowCount > 1 && (
            <div className="row-switch">
              <button onClick={nextRow}>
                <Icon icon="triangleUp" size="fill" />
              </button>
              <div className="number-display">{row + 1}</div>
              <button onClick={prevRow}>
                <Icon icon="triangleDown" size="fill" />
              </button>
            </div>
          )}
          <HotKeyRow row={row} />
        </div>
      </div>
      <div className="second-container">
        <ItemBrowser enableDrag={true} />
      </div>
    </div>
  );
}

export function InventoryTab() {
  return (
    <div className="inventory-tab">
      <Inventory />
    </div>
  );
}
