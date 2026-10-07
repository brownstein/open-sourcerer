import { Button } from "@mui/material";
import { useCallback } from "react";

import { PlayerRenderMode } from "src/api/characterCustomization";
import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { CharacterCustomization } from "src/components/title/CharacterCustomization";
import { useAppDispatch } from "src/redux/hooks";
import { setPlayerRenderMode } from "src/redux/status/slice";
import { closeCurrentModal } from "src/redux/ui/slice";

import { BaseModal } from "../BaseModal";
import "./CharacterCustomizationModal.css";

export type CharacterCustomizationModalProps =
  ModalComponentPropsType<"characterCustomization">;

/**
 * The in-game customizer, shown mid-intro once the camera has settled in the
 * cryo room. Until it's applied the player renders as a blank white
 * silhouette, so this modal can't be dismissed without choosing a look.
 */
export function CharacterCustomizationModal(
  props: CharacterCustomizationModalProps
) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();

  const onApply = useCallback(() => {
    dispatch(setPlayerRenderMode(PlayerRenderMode.Normal));
    dispatch(closeCurrentModal());
  }, [dispatch]);

  return (
    <BaseModal
      allowClose={false}
      size="large"
      fitContent
      opening={opening}
      closing={closing}
    >
      <div className="character-customization-modal-layout">
        <CharacterCustomization />
        <Button
          variant="contained"
          color="primary"
          data-testid="apply-character-button"
          onClick={onApply}
        >
          This Is Me
        </Button>
      </div>
    </BaseModal>
  );
}

export const CharacterCustomizationModalDefinition: ModalDefinitionType<"characterCustomization"> =
  {
    modalName: "characterCustomization",
    component: CharacterCustomizationModal
  };
