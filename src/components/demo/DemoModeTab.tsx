import { useTranslation } from "react-i18next";

import { useAppDispatch } from "src/redux/hooks";

import "./DemoModeTab.less";

export enum DemoScenario {
  FireBalls = "FireBalls",
  IceBridge = "IceBridge"
}

export function DemoModeTab() {
  const _dispatch = useAppDispatch();
  const { t: _t } = useTranslation();

  const _switchScenario = (scenario: string) => {
    if (!(scenario in DemoScenario)) return;
  };

  return (
    <div className="demo-mode-container">
      <div className="selected-scenario"></div>
    </div>
  );
}
