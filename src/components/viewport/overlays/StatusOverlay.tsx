import cx from "classnames";
import { useMemo } from "react";

import { ItemData } from "src/api/item";
import { HexBar } from "src/components/ui/hexbar/HexBar";
import { HotKeyRowWithNavigation } from "src/components/ui/item/HotKeyRowWithNavigation";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { CrystalItemAttributes } from "src/items/equipment/ManaCrystal";
import { OpponentBars } from "src/multiplayer/ui/OpponentBars";
import { useAppSelector } from "src/redux/hooks";
import {
  selectHealth,
  selectMana,
  selectManaSources,
  selectMaxHealth,
  selectMaxMana,
  selectPortrait
} from "src/redux/status/selectors";
import { selectUIElementEnabled } from "src/redux/ui/selectors";
import { EnableElements } from "src/redux/ui/slice";

import "./StatusOverlay.css";

function HexHealthBar() {
  const health = useAppSelector(selectHealth);
  const maxHealth = useAppSelector(selectMaxHealth);
  const value = health / maxHealth;
  return <HexBar valueFrac={value} className="hex-health-bar" />;
}

function HexManaBar() {
  const mana = useAppSelector(selectMana);
  const maxMana = useAppSelector(selectMaxMana);
  const manaSources = useAppSelector(selectManaSources);
  const manaSourceItems = useMemo(() => {
    return manaSources.map(
      (ms) =>
        ({
          type: "Crystal",
          id: ms.id,
          glowFraction: ms.available / ms.capacity
        }) satisfies ItemData & CrystalItemAttributes
    );
  }, [manaSources]);
  const value = mana / maxMana;
  const subSegments = manaSources.length * 10 + 10;
  return (
    <>
      <HexBar
        valueFrac={value}
        subSegmentCount={subSegments}
        className="hex-mana-bar"
      />
      {manaSourceItems.map((s) => (
        <div key={s.id} className="mana-source-item-rendered">
          <ItemRenderer item={s} />
        </div>
      ))}
    </>
  );
}

/** Hex bar ends. */

export type StatusOverlayProps = {
  containerWidth: number;
  containerHeight: number;
  viewportFocused?: boolean;
};

export function StatusOverlay(props: StatusOverlayProps) {
  const { viewportFocused } = props;

  const hudEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HUD)
  );

  const portraitEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.Portrait)
  );
  const hotBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HotBar)
  );
  const bottomHotBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.HotBarBottom)
  );
  const healthBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.Health)
  );
  const manaBarEnabled = useAppSelector((state) =>
    selectUIElementEnabled(state, EnableElements.Mana)
  );

  const hotBarEnabledAtTop = hotBarEnabled && !bottomHotBarEnabled;

  const portraitData = useAppSelector(selectPortrait);
  if (!hudEnabled) return null;

  return (
    <div
      className={cx("status-overlay", viewportFocused && "viewport-focused")}
    >
      <div className="portrait-block">
        {portraitEnabled && (
          <div
            className={cx("ui-portrait", portraitData.variant.toLowerCase())}
          />
        )}
      </div>
      <div className="non-portrait-ui">
        {hotBarEnabledAtTop && (
          <div className="status-overlay-hotkeys">
            <HotKeyRowWithNavigation interactive={!viewportFocused} />
          </div>
        )}
        <div className={cx("bars-and-status", "horizontal-bars-and-status")}>
          <div className="bars">
            {healthBarEnabled && <HexHealthBar />}
            {manaBarEnabled && <HexManaBar />}
            <OpponentBars />
          </div>
        </div>
      </div>
    </div>
  );
}
