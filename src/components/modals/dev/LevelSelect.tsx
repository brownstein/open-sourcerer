import { useCallback } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { LevelLoadList } from "src/components/level-editor/LevelLoadPicker";
import { BaseModal } from "src/components/modals/BaseModal";
import { useHotLoaderIds } from "src/components/util/useHotLoaderIds";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import { gotoLevel } from "src/redux/gameState/slice";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import "./LevelSelect.css";

export type LevelSelectModalProps = ModalComponentPropsType<"levelSelect">;

export function LevelSelectModal(props: LevelSelectModalProps) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const levelIds = useHotLoaderIds(levelLoaderContext.hotLoaders.levels);

  const handleSelect = useCallback(
    (levelId: string) => {
      dispatch(gotoLevel({ levelId }));
      dispatch(closeCurrentModal());
    },
    [dispatch]
  );

  return (
    <BaseModal
      title="Level Select"
      size="medium"
      opening={opening}
      closing={closing}
    >
      <div className="level-select-modal">
        <LevelLoadList
          levelIds={levelIds}
          onSelect={handleSelect}
          autoFocusSearch
        />
      </div>
    </BaseModal>
  );
}

export const LevelSelectModalDefinition: ModalDefinitionType<"levelSelect"> = {
  modalName: "levelSelect",
  component: LevelSelectModal
};
