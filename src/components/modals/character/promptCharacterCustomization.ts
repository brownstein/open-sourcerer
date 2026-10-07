import { pushModalTyped } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { storeConditionPromise } from "src/util/storeCondition";

/**
 * Opens the customizer and resolves once the player has applied it. Cutscene
 * scripts await this to hold the sequence until the character exists.
 *
 * Deliberately kept free of component imports: level modules are reachable
 * from the level registry, and importing the modal component here would close
 * a require cycle back through LevelLoader.
 */
export function promptCharacterCustomization() {
  const action = pushModalTyped({
    modalName: "characterCustomization",
    modalArg: {},
    disallowClose: true
  });
  store.dispatch(action);
  const modalId = action.payload.id;
  return storeConditionPromise(
    (state) => !state.ui.modalStack?.some((modal) => modal.id === modalId)
  );
}
