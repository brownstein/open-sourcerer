import { savedSpellToItemData } from "src/api/spells";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch } from "src/redux/hooks";
import { addItems } from "src/redux/shared/actions";
import { builtInSpells } from "src/scripting/builtinScripts";

import "./BuiltInScriptList.less";

export function BuiltInScriptList() {
  const dispatch = useAppDispatch();

  return (
    <div className="debug-script-grid">
      {Object.entries(builtInSpells).map(([key, spell]) => (
        <div
          key={key}
          className="tile"
          onClick={() => {
            dispatch(addItems({
              item: savedSpellToItemData(spell),
              hotkey: true
            }));
          }}
        >
          <div className="script-icon">
            <ItemRenderer item={savedSpellToItemData(spell)} />
          </div>
          <div className="script-title">{key}</div>
        </div>
      ))}
    </div>
  );
}
