import cx from "classnames";

import { OverlayPosition } from "src/api/overlay";
import { HotKeyRowWithNavigation } from "src/components/ui/item/HotKeyRowWithNavigation";
import {
  OverlayRenderer,
  useOverlays
} from "src/components/ui/overlays/OverlayRenderer";
import { useAppSelector } from "src/redux/hooks";
import { selectUIElementEnabled } from "src/redux/ui/selectors";
import { EnableElements } from "src/redux/ui/slice";

import "./ViewportBottomBarOverlay.less";

export function ViewportBottomBarOverlay() {
  const hudEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HUD)
  );
  const hotBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HotBar)
  );
  const bottomHotBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HotBarBottom)
  );
  const bottomOverlays = useOverlays(OverlayPosition.ViewportBottom);
  const hotBarEnabledAtBottom =
    hotBarEnabled && bottomHotBarEnabled && hudEnabled;
  const anythingAtBottom = hotBarEnabledAtBottom || !!bottomOverlays.length;

  if (!anythingAtBottom) return null;

  return (
    <div
      className={cx(
        "viewport-bottom-bar",
        !!bottomOverlays.length && "with-overlays"
      )}
    >
      {!!bottomOverlays.length && (
        <OverlayRenderer position={OverlayPosition.ViewportBottom} />
      )}
      {hotBarEnabledAtBottom && (
        <HotKeyRowWithNavigation enableDragOut={false} />
      )}
    </div>
  );
}
