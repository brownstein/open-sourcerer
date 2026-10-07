import cx from "classnames";
import { useEffect, useState } from "react";

import { OverlayComponentProps } from "src/api/overlay";
import { TypedEventEmitter } from "src/api/util";
import { HexBar } from "src/components/ui/hexbar/HexBar";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { delay } from "src/scripting/core/util";

import "./BossHealthBar.less";

export type BossHealthBarEvents = {
  healthUpdated: number;
  dead: void;
};

export type BossHealthBarOverlayProps = {
  maxHealth: number;
  bossName?: string; // TODO: localization.
  healthEvents?: TypedEventEmitter<BossHealthBarEvents>;
};

export type BossHealthBarProps =
  OverlayComponentProps<BossHealthBarOverlayProps>;

export function BossHealthBar(props: BossHealthBarProps) {
  const { overlayProps, api: _api, id: _id } = props;
  const {
    bossName,
    maxHealth,
    healthEvents: healthEmitter
  } = overlayProps ?? {};

  const [barRef, barSize] = useMeasureSize<HTMLDivElement>();
  const [health, setHealth] = useState(maxHealth ?? 100);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    delay(10).then(() => setInitialized(true));
    const onHealthUpdate = (health: number) => setHealth(health);
    const onDead = () => setInitialized(false);
    healthEmitter?.on("healthUpdated", onHealthUpdate);
    healthEmitter?.on("dead", onDead);
    return () => {
      healthEmitter?.off("healthUpdated", onHealthUpdate);
      healthEmitter?.off("dead", onDead);
    };
  }, [healthEmitter]);

  return (
    <div className="boss-health-bar-container">
      <div
        className={cx("boss-health-bar", initialized && "initialized")}
        ref={barRef}
      >
        {bossName && <div className="boss-health-bar-name">{bossName}</div>}
        <HexBar
          className="hex-health-bar"
          valueFrac={health / maxHealth}
          subSegmentCount={10}
        />
      </div>
    </div>
  );
}
