import { Button, TextField } from "@mui/material";
import {
  ChangeEventHandler,
  MouseEvent,
  SubmitEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import shortid from "shortid";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { SpellIconSpec } from "src/api/spellIcons";
import {
  SavedSpellAspect,
  SpellItemData,
  savedSpellToItemData
} from "src/api/spells";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { BaseModal } from "src/components/modals/BaseModal";
import {
  fireSpellPalette,
  iceSpellPalette,
  miscSpellPalette
} from "src/components/modals/spell/shared-spell-editing/palettes";
import { Icon } from "src/components/ui/icons/Icon";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { SpellIconCustomizer } from "src/components/ui/spells/SpellIconCustomizer";
import {
  makeDefaultSpellIcon,
  randomizeSpellIcon
} from "src/components/ui/spells/spellIconDefaults";
import { addItems } from "src/redux/shared/actions";
import { closeCurrentModal } from "src/redux/ui/slice";

import "./SaveSpellOld.less";

export type SaveSpellModalProps = ModalComponentPropsType<"saveSpell">;

export function SaveSpellModal(props: SaveSpellModalProps) {
  const { modalArg, opening, closing } = props;
  const {
    code = "",
    codeEditorId = "",
    existingSpell,
    duplicatingSpell
  } = modalArg;

  const controller = useContext(GameControllerContext);
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const [spellName, setSpellName] = useState(() =>
    existingSpell || duplicatingSpell
      ? t("modals.saveSpell.copyOf", {
          name: existingSpell?.name ?? duplicatingSpell?.name ?? '"'
        })
      : ""
  );
  const [spellNameMissing, setSpellNameMissing] = useState(false);
  const [spellColor, setSpellColor] = useState<number | null>(null);
  const [spellAspect, setSpellAspect] = useState<SavedSpellAspect | null>(null);
  const [spellImportSet, setSpellImportSet] = useState<Set<string> | null>(
    null
  );
  const [spellIcon, setSpellIcon] = useState<SpellIconSpec>(() =>
    makeDefaultSpellIcon()
  );

  const randomize = useCallback(() => {
    const palette = [
      ...fireSpellPalette,
      ...iceSpellPalette,
      ...miscSpellPalette
    ];
    const primaryColor = palette.at(Math.floor(Math.random() * palette.length));
    setSpellColor(primaryColor ?? 0xffffff);
    setSpellIcon(randomizeSpellIcon());
  }, []);

  useEffect(() => {
    const spellRuntime = controller?.spellRuntime;
    if (!spellRuntime) return;
    const resolveAspect = async () => {
      const imports = await spellRuntime.computeImports(code);
      setSpellImportSet(new Set(imports ?? []));
      if (imports) {
        if (imports.includes("fire")) {
          setSpellAspect(SavedSpellAspect.Fire);
          randomize();
          return;
        }
        if (imports.includes("ice")) {
          setSpellAspect(SavedSpellAspect.Ice);
          randomize();
          return;
        }
      }
    };
    resolveAspect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, code]);

  const onChangeSpellName = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => setSpellName(e.target.value),
    []
  );

  const spellItemData = useMemo<SpellItemData>(
    () => ({
      type: "spell",
      scriptId: "",
      scriptMetadata: {
        spellName,
        color: spellColor ?? undefined,
        imports: [...(spellImportSet?.values() ?? [])],
        aspect: spellAspect ?? undefined,
        icon: spellIcon
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spellName, spellColor, spellAspect, spellIcon]
  );

  const onExportSpell = useCallback(() => {
    const payload = {
      name: spellName || "Untitled Spell",
      code,
      id: shortid(),
      metadata: spellItemData.scriptMetadata
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(spellName || "spell").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [spellName, code, spellItemData]);

  const onSaveSpell = useCallback(
    (event?: SubmitEvent<HTMLFormElement> | MouseEvent) => {
      event?.preventDefault();
      if (!spellName) {
        setSpellNameMissing(true);
        return;
      }
      dispatch(
        addItems({
          item: savedSpellToItemData({
            name: spellName,
            code: code,
            id: shortid(),
            metadata: spellItemData.scriptMetadata
          }),
          hotkey: true,
          updateEditorId: codeEditorId
        })
      );
      dispatch(closeCurrentModal());
    },
    [dispatch, code, codeEditorId, spellName, spellItemData]
  );

  return (
    <BaseModal
      title={t("modals.saveSpell.title")}
      size="large"
      opening={opening}
      closing={closing}
    >
      <div className="save-spell-layout">
        <div className="save-spell-layout-columns">
          <div className="save-spell-layout-column column-1">
            <TextField
              id="save-spell-name"
              label={t("modals.saveSpell.nameField")}
              variant="standard"
              value={spellName}
              onChange={onChangeSpellName}
              error={spellNameMissing}
              helperText={spellNameMissing ? "A spell name is required." : null}
              autoFocus
            />
            <div className="save-spell-item-preview">
              <ItemRenderer item={spellItemData} />
            </div>
            <div className="save-spell-randomize">
              <Button
                className="save-spell-randomize-button"
                onClick={randomize}
              >
                <Icon icon="mlcDice" size="fill" />
              </Button>
            </div>
          </div>
          <div className="save-spell-layout-column column-2">
            <SpellIconCustomizer value={spellIcon} onChange={setSpellIcon} />
          </div>
        </div>
        <div className="save-spell-modal-buttom-button-container">
          <Button variant="outlined" onClick={onExportSpell}>
            Export Spell
          </Button>
          <Button variant="contained" onClick={onSaveSpell}>
            {t("modals.saveSpell.saveButton")}
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}

export const SaveSpellModalDefinition: ModalDefinitionType<"saveSpell"> = {
  modalName: "saveSpell",
  component: SaveSpellModal
};
