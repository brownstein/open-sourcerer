import { Button } from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import SyntaxHighlighter from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/hljs";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { SpellBrowser } from "src/components/inventory/SpellBrowser";
import { BaseModal } from "src/components/modals/BaseModal";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import {
  selectAllScripts,
  selectScriptById
} from "src/redux/scriptLibrary/selectors";
import { closeCurrentModal } from "src/redux/ui/slice";

import "./LoadSpell.less";

export type LoadSpellModalProps = ModalComponentPropsType<"loadSpell">;

export function LoadSpellModal(props: LoadSpellModalProps) {
  const { modalArg, opening, closing } = props;
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const _allSpells = useAppSelector(selectAllScripts);

  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);
  const selectedSpell = useAppSelector((state) =>
    selectedSpellId ? selectScriptById(state, selectedSpellId) : null
  );

  const onLoadSpell = useCallback(() => {
    if (!selectedSpell || !modalArg?.codeEditorId) return;
    dispatch(
      upsertEditor({
        id: modalArg.codeEditorId,
        code: selectedSpell.code,
        codeUpdatedAt: Date.now(),
        scriptId: selectedSpell.id,
        savedSpellSnapshot: selectedSpell
      })
    );
    dispatch(closeCurrentModal());
  }, [dispatch, selectedSpell, modalArg]);

  const onDoubleClickSpell = useCallback(
    (spell: SavedSpell) => {
      if (!modalArg?.codeEditorId) return;
      dispatch(
        upsertEditor({
          id: modalArg?.codeEditorId,
          code: spell.code,
          codeUpdatedAt: Date.now(),
          scriptId: spell.id,
          savedSpellSnapshot: spell
        })
      );
      dispatch(closeCurrentModal());
    },
    [dispatch, modalArg]
  );

  return (
    <BaseModal
      title={t("modals.loadSpell.title")}
      size="large"
      opening={opening}
      closing={closing}
    >
      <div className="load-spell-layout">
        <div className="load-spell-spell-list">
          <SpellBrowser
            onClickSpell={(s) => setSelectedSpellId(s.id)}
            onDoubleClickSpell={onDoubleClickSpell}
            selectedSpellId={selectedSpellId ?? undefined}
          />
        </div>
        <div className="load-spell-spell-preview">
          <div className="load-spell-spell-preview-icon">
            <ItemRenderer
              item={selectedSpell ? savedSpellToItemData(selectedSpell) : null}
            />
          </div>
          <div className="load-spell-spell-preview-name">
            {selectedSpell?.name ?? t("modals.loadSpell.selectASpell")}
          </div>
          <div className="load-spell-spell-preview-code">
            <SyntaxHighlighter
              style={vs}
              language="javascript"
              useInlineStyles={false}
              children={selectedSpell?.code}
            />
          </div>
          <div className="load-spell-load-spell-button">
            <Button
              variant="contained"
              disabled={!selectedSpell}
              onClick={onLoadSpell}
            >
              {t("modals.loadSpell.loadButton")}
            </Button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

export const LoadSpellModalDefinition: ModalDefinitionType<"loadSpell"> = {
  modalName: "loadSpell",
  component: LoadSpellModal
};
