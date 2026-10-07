import { useEffect, useRef, useState } from "react";

export type AnimatedTransitionProps = {
  started?: boolean;
  duration: number;
  frameMs?: number;
  onComplete?: () => void;
  duringTransition?: (valud: number) => void;
};

function noOp() {}

export function useAnimatedTransition(props: AnimatedTransitionProps) {
  const {
    started = false,
    duration = 1000,
    frameMs = 13,
    onComplete,
    duringTransition
  } = props;
  const iStateRef = useRef<{
    timeout: number | null;
    timeLast: number;
    timePassed: number;
    value: number;
    onComplete?: () => void;
    duringTransition?: (value: number) => void;
  }>({
    timeout: null,
    timeLast: 0,
    timePassed: 0,
    value: 0,
    onComplete,
    duringTransition
  });
  iStateRef.current.onComplete = onComplete;
  iStateRef.current.duringTransition = duringTransition;
  const [currentValue, setCurrentValue] = useState<number>(0);
  useEffect(() => {
    const state = iStateRef.current;
    if (!started) {
      if (!!state.value) {
        state.value = 0;
        setCurrentValue(0);
      }
      return noOp;
    }
    const nextFrame = () => {
      const now = new Date().getTime();
      state.timePassed += now - state.timeLast;
      state.timeLast = now;
      if (state.value < 1) {
        state.value = Math.min(1, state.timePassed / duration);
        state.timeout = setTimeout(nextFrame, frameMs) as unknown as number;
        setCurrentValue(state.value);
        if (state.value === 1) {
          state.onComplete?.();
        } else {
          state.duringTransition?.(state.value);
        }
      } else {
        state.timeout = 0;
      }
    };
    const now = new Date().getTime();
    state.timePassed = 0;
    state.timeLast = now;
    nextFrame();
    return () => {
      if (state.timeout !== null) clearTimeout(state.timeout);
      state.timeout = null;
    };
  }, [setCurrentValue, iStateRef, started, duration, frameMs]);
  return currentValue;
}
