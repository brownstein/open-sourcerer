import { useEffect, useState } from "react";

import { delay } from "src/scripting/core/util";

export enum TransitionState {
  entered = "entered",
  exited = "exited",
  entering = "entering",
  exiting = "exiting"
}

function getInitialState(entered: boolean, startIn?: boolean) {
  if (!entered) return TransitionState.exited;
  if (startIn !== undefined) {
    return startIn ? TransitionState.entered : TransitionState.entering;
  }
  return TransitionState.entered;
}

export function useStatefulTransition(
  entered: boolean,
  duration: number,
  startIn?: boolean
) {
  const [state, setState] = useState(getInitialState(entered, startIn));
  useEffect(() => {
    if (entered && state === "entered") return;
    if (!entered && state === "exited") return;
    let cleanup: (() => void) | undefined;
    const doTransition = async () => {
      let cancelled = false;
      if (
        entered &&
        state !== TransitionState.entered &&
        state !== TransitionState.entering
      ) {
        setState(TransitionState.entering);
        return;
      }
      if (
        !entered &&
        state !== TransitionState.exited &&
        state !== TransitionState.exiting
      ) {
        setState(TransitionState.exiting);
        return;
      }
      if (state === TransitionState.entering) {
        cleanup = () => (cancelled = true);
        await delay(duration);
        if (!cancelled) setState(TransitionState.entered);
        return;
      }
      if (state === TransitionState.exiting) {
        cleanup = () => (cancelled = true);
        await delay(duration);
        if (!cancelled) setState(TransitionState.exited);
        return;
      }
    };
    doTransition();
    return cleanup;
  }, [entered, duration, state]);
  return state;
}
