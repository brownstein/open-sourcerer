import { useCallback, useMemo, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { BaseModal } from "src/components/modals/BaseModal";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch } from "src/redux/hooks";
import { addItems } from "src/redux/shared/actions";
import { closeCurrentModal } from "src/redux/ui/slice";
import { builtInSpells } from "src/scripting/builtinScripts";

import "./SpellSelect.css";

export type SpellSelectModalProps = ModalComponentPropsType<"spellSelect">;

type SpellEntry = {
  key: string;
  spell: SavedSpell;
  searchKey: string;
};

export function SpellSelectModal(props: SpellSelectModalProps) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");

  const entries = useMemo<SpellEntry[]>(() => {
    const out = Object.entries(builtInSpells).map(([key, spell]) => ({
      key,
      spell,
      searchKey: `${key} ${spell.name} ${spell.id}`.toLowerCase()
    }));
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.searchKey.includes(q));
  }, [entries, query]);

  // Add the selected built-in spell preset to the inventory and hotbar. This is
  // a dev convenience for granting known presets in-game; it does not open an
  // editor.
  const handleSelect = useCallback(
    (spell: SavedSpell) => {
      dispatch(
        addItems({ item: savedSpellToItemData(spell), hotkey: true })
      );
      dispatch(closeCurrentModal());
    },
    [dispatch]
  );

  return (
    <BaseModal
      title="Spell Select"
      size="medium"
      opening={opening}
      closing={closing}
    >
      <div className="spell-select-modal">
        <input
          autoFocus
          className="spell-select-search"
          placeholder="Filter spells…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spell-select-list">
          {filtered.length === 0 ? (
            <div className="spell-select-empty">No matches</div>
          ) : (
            filtered.map((entry) => (
              <button
                type="button"
                key={entry.key}
                className="spell-select-row"
                onClick={() => handleSelect(entry.spell)}
              >
                <div className="spell-select-thumb">
                  <ItemRenderer item={savedSpellToItemData(entry.spell)} />
                </div>
                <div className="spell-select-text">
                  <div className="spell-select-name">{entry.spell.name}</div>
                  <div className="spell-select-id">{entry.key}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </BaseModal>
  );
}

export const SpellSelectModalDefinition: ModalDefinitionType<"spellSelect"> = {
  modalName: "spellSelect",
  component: SpellSelectModal
};
