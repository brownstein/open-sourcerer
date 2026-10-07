import { Button } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { savedSpellToItemData } from "src/api/spells";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch } from "src/redux/hooks";
import { deleteScript } from "src/redux/scriptLibrary/slice";
import { closeCurrentModal } from "src/redux/ui/slice";

import { BaseModal } from "../BaseModal";
import "./DeleteSpell.css";

export type DeleteSpellModalProps = ModalComponentPropsType<"deleteSpell">;

export function DeleteSpellModal(props: DeleteSpellModalProps) {
  const { modalArg, opening, closing } = props;
  const { spell } = modalArg;
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const spellItem = useMemo(() => savedSpellToItemData(spell), [spell]);

  const onSubmit = useCallback(() => {
    dispatch(deleteScript(spell.id));
    dispatch(closeCurrentModal());
  }, [dispatch, spell]);

  return (
    <BaseModal
      title={t("modals.deleteSpell.title", { name: spell.name })}
      size="small"
      opening={opening}
      closing={closing}
    >
      <div className="delete-spell-layout">
        <h2>{t("modals.deleteSpell.areYouSure", { name: spell.name })}</h2>
        <div className="delete-spell-preview">
          <ItemRenderer item={spellItem} />
        </div>
        <Button variant="contained" color="primary" onClick={onSubmit}>
          {t("modals.deleteSpell.deleteButton")}
        </Button>
      </div>
    </BaseModal>
  );
}

export const DeleteSpellModalDefinition: ModalDefinitionType<"deleteSpell"> = {
  modalName: "deleteSpell",
  component: DeleteSpellModal
};
