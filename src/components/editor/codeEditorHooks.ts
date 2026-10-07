import { useContext, useEffect, useMemo, useState } from "react";

import {
  SpellCtxConsoleLogLine,
  SpellCtxEvents,
  SpellError
} from "src/api/spells";

import { GameControllerContext } from "../context/GameControllerContext";

export function useSpellRuntime() {
  const controller = useContext(GameControllerContext);
  return controller?.spellRuntime ?? null;
}

export function useSpellContext(contextId?: string | null) {
  const controller = useContext(GameControllerContext);
  return useMemo(() => {
    if (!contextId) return null;
    return controller?.spellRuntime?.getSpellCtx(contextId) ?? null;
  }, [controller, contextId]);
}

function _noOp() {}

export function useSpellContextState(contextId?: string | null) {
  const controller = useContext(GameControllerContext);
  const spellRuntime = controller?.spellRuntime;

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentLine, setCurrentLine] = useState<number | null>();
  const [currentError, setCurrentError] = useState<SpellError | null>();
  const [consoleOutput, setConsoleOutput] = useState<SpellCtxConsoleLogLine[]>(
    []
  );

  useEffect(() => {
    if (!contextId) return _noOp;

    const ctx = spellRuntime?.getSpellCtx(contextId);
    if (ctx?.destroyed) {
      setRunning(false);
      setPaused(false);
      return;
    }

    const onRun = () => setRunning(true);
    const onPause = () => setPaused(true);
    const onResume = () => setPaused(false);
    const onProgress = (line: number) => setCurrentLine(line);
    const onComplete = () => {
      setRunning(false);
      setPaused(false);
    };
    const onTerminate = () => {
      setRunning(false);
      setPaused(false);
    };
    const onError = (err: SpellError) => {
      setCurrentError(err);
      setRunning(false);
      setPaused(false);
    };
    const onConsoleOutput = () => setConsoleOutput(ctx?.consoleOutput ?? []);

    setRunning(ctx?.running ?? false);
    setPaused(ctx?.paused ?? false);
    setCurrentError(ctx?.error ?? null);
    setCurrentLine(ctx?.currentLine ?? null);

    ctx?.events.on(SpellCtxEvents.runStarted, onRun);
    ctx?.events.on(SpellCtxEvents.runComplete, onComplete);
    ctx?.events.on(SpellCtxEvents.runPaused, onPause);
    ctx?.events.on(SpellCtxEvents.runResumed, onResume);
    ctx?.events.on(SpellCtxEvents.runProgress, onProgress);
    ctx?.events.on(SpellCtxEvents.runTerminated, onTerminate);
    ctx?.events.on(SpellCtxEvents.runError, onError);
    ctx?.events.on(SpellCtxEvents.consoleLog, onConsoleOutput);

    return () => {
      ctx?.events.off(SpellCtxEvents.runStarted, onRun);
      ctx?.events.off(SpellCtxEvents.runComplete, onComplete);
      ctx?.events.off(SpellCtxEvents.runPaused, onPause);
      ctx?.events.off(SpellCtxEvents.runResumed, onResume);
      ctx?.events.off(SpellCtxEvents.runProgress, onProgress);
      ctx?.events.off(SpellCtxEvents.runTerminated, onTerminate);
      ctx?.events.off(SpellCtxEvents.runError, onError);
      ctx?.events.off(SpellCtxEvents.consoleLog, onConsoleOutput);
    };
  }, [spellRuntime, contextId]);

  return {
    running,
    paused,
    currentLine,
    currentError,
    consoleOutput
  };
}
