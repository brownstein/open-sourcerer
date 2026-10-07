import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { RootState, store } from "src/redux/store";

export function storeConditionPromise(
  selector: (s: RootState) => boolean | undefined
) {
  const currentState = store.getState();
  if (selector(currentState)) return Promise.resolve();
  const deferredEmitter = new DeferredEmitter();
  const unSub = store.subscribe(() => {
    const nextState = store.getState();
    if (selector(nextState)) {
      unSub();
      deferredEmitter.emit("done");
    }
  });
  return deferredEmitter.getPromise();
}
