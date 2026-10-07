import { Button, IconButton, TextField, Tooltip } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import shortid from "shortid";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { SpellIconSpec } from "src/api/spellIcons";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { BaseModal } from "src/components/modals/BaseModal";
import { Icon } from "src/components/ui/icons/Icon";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { SpellIconCustomizer } from "src/components/ui/spells/SpellIconCustomizer";
import { spellIconDefs } from "src/components/ui/spells/spellIconDefs";
import { saveScript } from "src/redux/scriptLibrary/slice";
import { addItems } from "src/redux/shared/actions";
import { closeCurrentModal } from "src/redux/ui/slice";

import "./SaveSpell.css";

export type SaveSpellModalProps = ModalComponentPropsType<"saveSpell">;

type SaveSpellFormData = {
  name: string;
};

const defaultSpellIcon: SpellIconSpec = {
  layers: [
    {
      iconKey: "terminal",
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      color: 0xffffff
    }
  ]
};

export function SaveSpellModal(props: SaveSpellModalProps) {
  const { modalArg, opening, closing } = props;
  const {
    code = "",
    codeEditorId = "",
    existingSpell,
    duplicatingSpell,
    editInPlace
  } = modalArg;

  const { t } = useTranslation();
  const dispatch = useDispatch();

  const extant = existingSpell ?? duplicatingSpell;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<SaveSpellFormData>({
    defaultValues: {
      name: extant
        ? editInPlace
          ? extant.name
          : t("modals.saveSpell.copyOf", { name: extant.name })
        : undefined
    }
  });

  const spellName = watch("name");
  const [spellMetadata, setSpellMetadata] = useState<SavedSpell["metadata"]>(
    extant?.metadata ?? {
      icon: defaultSpellIcon
    }
  );
  const spellId = useMemo(
    () => (extant && editInPlace ? extant.id : shortid()),
    [extant, editInPlace]
  );
  const spellToSave = useMemo<SavedSpell>(
    () => ({
      id: spellId,
      name: spellName,
      code,
      metadata: spellMetadata
    }),
    [spellId, spellName, code, spellMetadata]
  );
  const spellToSaveItem = useMemo(
    () => savedSpellToItemData(spellToSave),
    [spellToSave]
  );

  const randomizeSpellIcon = useCallback(() => {
    const icon: SpellIconSpec = {
      layers: [
        {
          iconKey:
            spellIconDefs.at(Math.floor(spellIconDefs.length * Math.random()))
              ?.iconKey ?? "terminal",
          color: 0x777777 + Math.floor(Math.random() * 0x888888),
          position: { x: 0, y: 0 },
          scale: 0.5 + Math.random(),
          rotation: (-0.5 + Math.random()) * 360
        }
      ]
    };
    setSpellMetadata((md) => ({
      ...md,
      icon
    }));
  }, []);

  const onSubmit: SubmitHandler<SaveSpellFormData> = (data) => {
    dispatch(
      addItems({
        item: savedSpellToItemData({
          name: data.name,
          code,
          id: spellId,
          metadata: spellMetadata
        }),
        // editInPlace re-saves an existing spell, so skip granting a new hotkey.
        hotkey: !editInPlace,
        updateEditorId: codeEditorId
      })
    );
    dispatch(closeCurrentModal());
  };

  return (
    <BaseModal
      title={
        editInPlace ? t("modals.editSpell.title") : t("modals.saveSpell.title")
      }
      size="medium"
      opening={opening}
      closing={closing}
    >
      <form className="save-spell-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="spell-name-and-preview">
          <ItemRenderer
            item={spellToSaveItem}
            className="save-spell-spell-icon"
          />
          <div className="save-spell-name-wrapper">
            <TextField
              id="save-spell-name"
              label={t("modals.saveSpell.nameField")}
              variant="outlined"
              helperText={errors.name?.message}
              fullWidth
              autoFocus
              error={!!errors.name}
              {...register("name", {
                required: t("modals.saveSpell.nameMissing"),
                maxLength: 128,
                minLength: 1
              })}
            />
          </div>
        </div>
        <div className="save-spell-customize-wrapper">
          <div className="save-spell-customize-header">
            <h3>{t("modals.saveSpell.customize")}</h3>
            <div className="save-spell-randomize">
              <Tooltip title={t("modals.saveSpell.randomize")}>
                <IconButton onClick={randomizeSpellIcon}>
                  <Icon icon="mlcDice" size="font" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="save-spell-customizer">
            <SpellIconCustomizer
              value={spellMetadata?.icon ?? defaultSpellIcon}
              onChange={(icon) => setSpellMetadata((m) => ({ ...m, icon }))}
            />
          </div>
        </div>
        <div className="save-spell-form-actions">
          <Button type="submit" variant="contained" color="primary">
            {t("modals.editSpell.saveButton")}
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}

export const SaveSpellModalDefinition: ModalDefinitionType<"saveSpell"> = {
  modalName: "saveSpell",
  component: SaveSpellModal
};
