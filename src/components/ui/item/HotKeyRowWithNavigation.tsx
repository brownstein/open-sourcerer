import { MouseEvent } from "react";

import { Icon } from "src/components/ui/icons/Icon";
import { HotKeyRow } from "src/components/ui/item/HotKeyRow";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  selectHotKeyCurrentRow,
  selectHotKeyRowCount
} from "src/redux/inventory/selectors";
import { setHotKeyCurrentRow } from "src/redux/inventory/slice";

import "./HotKeyRowWithNavigation.less";

export type HotKeyRowWithNavigationProps = {
  interactive?: boolean;
  enableDragOut?: boolean;
  vertical?: boolean;
};

const preventFocus = (e: MouseEvent) => e.preventDefault();

export function HotKeyRowWithNavigation(props: HotKeyRowWithNavigationProps) {
  const { interactive, enableDragOut, vertical } = props;
  const dispatch = useAppDispatch();
  const currentRow = useAppSelector(selectHotKeyCurrentRow);
  const rowCount = useAppSelector(selectHotKeyRowCount);

  const nextRow = () =>
    dispatch(setHotKeyCurrentRow((currentRow + 1) % rowCount));
  const prevRow = () =>
    dispatch(setHotKeyCurrentRow((currentRow + rowCount - 1) % rowCount));

  return (
    <div className="hotbar-section">
      {rowCount > 1 && (
        <div className="row-switch">
          <button onClick={nextRow} onMouseDown={preventFocus}>
            <Icon icon="triangleUp" size="fill" />
          </button>
          <div className="number-display">{currentRow + 1}</div>
          <button onClick={prevRow} onMouseDown={preventFocus}>
            <Icon icon="triangleDown" size="fill" />
          </button>
        </div>
      )}
      <HotKeyRow
        interactive={interactive}
        enableDragOut={enableDragOut}
        vertical={vertical}
      />
    </div>
  );
}
