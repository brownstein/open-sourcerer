import { useCallback } from "react";

import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectUIElementEnabled } from "src/redux/ui/selectors";
import {
  EnableElements,
  EnableElementsArr,
  disableUIElements,
  enableUIElements
} from "src/redux/ui/slice";

import "./UIElementList.less";

export function UIElementList() {
  return (
    <ul className="ui-elements-list">
      {EnableElementsArr.map((el) => (
        <UIElementToggle key={el} el={el} />
      ))}
    </ul>
  );
}

function UIElementToggle({ el }: { el: EnableElements }) {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector((state) => selectUIElementEnabled(state, el));

  const toggle = useCallback(() => {
    if (enabled) {
      dispatch(disableUIElements([el]));
    } else {
      dispatch(enableUIElements([el]));
    }
  }, [dispatch, el, enabled]);

  return (
    <li className={`ui-element-enabler ${enabled ? "enabled" : ""}`}>
      <input
        type="checkbox"
        id={`enable-${el}`}
        checked={enabled}
        onChange={toggle}
      />
      <label htmlFor={`enable-${el}`}>{el}</label>
    </li>
  );
}
