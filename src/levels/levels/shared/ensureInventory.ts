import { AddItemsArgument, addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

export function ensureInventory(...items: AddItemsArgument[]) {
  store.dispatch(addItems(...items));
}
