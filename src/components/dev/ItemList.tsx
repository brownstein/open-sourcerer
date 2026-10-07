import React from "react";

import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { allItems } from "src/items/allItems";
import { CurrencyDefinition } from "src/items/currencies/Currency";
import { useAppDispatch } from "src/redux/hooks";
import { addItems } from "src/redux/shared/actions";

import "./ItemList.less";

export function ItemList() {
  const dispatch = useAppDispatch();
  const handleAdd = (
    type: string,
    variant: string | undefined,
    isConsumable: boolean
  ) => {
    if (type === CurrencyDefinition.type) {
      dispatch(addItems({ item: { type, variant }, count: 1 }));
    } else if (isConsumable) {
      dispatch(
        addItems({ item: { type, variant }, count: 1, hotkey: true })
      );
    } else {
      dispatch(addItems({ item: { type }, count: 1 }));
    }
  };

  return (
    <div className="debug-item-grid">
      {allItems.map((def) =>
        [...(def.variants ?? [undefined])].map((variant) => (
          <div
            key={def.type}
            className="tile"
            onClick={() => handleAdd(def.type, variant, !!def.consume)}
          >
            <ItemRenderer
              item={{
                type: def.type,
                variant: variant
              }}
            />
          </div>
        ))
      )}
    </div>
  );
}
