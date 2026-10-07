import { MenuItem, Select, SelectChangeEvent } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useHotLoaderIds } from "src/components/util/useHotLoaderIds";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import { selectLevelId } from "src/redux/gameState/selectors";
import { gotoLevel } from "src/redux/gameState/slice";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";

import "./LevelSelector.less";
import { LevelUploader } from "./LevelUploader";

export function LevelSelectorTab() {
  return (
    <div className="level-selector-tab" data-testid="level-selector">
      <h3>Level Select</h3>
      <LevelSelectorContent />
      <h3>Level Loader</h3>
      <LevelUploader />
    </div>
  );
}

export function LevelSelectorContent() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const currentLevelId = useAppSelector(selectLevelId);
  const levelIds = useHotLoaderIds(levelLoaderContext.hotLoaders.levels);

  const handleChangeLevel = useCallback(
    (event: SelectChangeEvent<string | null>) => {
      const levelId = event.target.value;
      if (typeof levelId !== "string") return;
      dispatch(gotoLevel({ levelId }));
    },
    [dispatch]
  );

  return (
    <div>
      <Select
        label={t("levelSelector.selectLevel")}
        data-testid="level-select-dropdown"
        onChange={handleChangeLevel}
        value={currentLevelId}
      >
        {levelIds.map((id) => (
          <MenuItem key={id} value={id}>
            {id}
          </MenuItem>
        ))}
      </Select>
    </div>
  );
}
