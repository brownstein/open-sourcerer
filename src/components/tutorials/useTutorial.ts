import { useMemo } from "react";

import { TutorialStep, Tutorial } from "src/api/tutorials";
import { useAppSelector } from "src/redux/hooks";
import {
  selectCurrentTutorialId,
  selectCurrentTutorialStep
} from "src/redux/ui/selectors";

import { allTutorials } from "./tutorials/allTutorials";

export function useTutorialAndCurrentStep_Redux(): [
  Tutorial | null,
  TutorialStep | null,
  number | null
] {
  const currentTutorialId = useAppSelector(selectCurrentTutorialId);
  const currentTutorialStep = useAppSelector(selectCurrentTutorialStep);
  const tutorial = useMemo(() => {
    if (!currentTutorialId) return null;
    return allTutorials.get(currentTutorialId);
  }, [currentTutorialId]);
  return useMemo(() => {
    if (!tutorial) return [null, null, null];
    return [
      tutorial,
      tutorial.steps.at(currentTutorialStep) ?? null,
      currentTutorialStep
    ];
  }, [tutorial, currentTutorialStep]);
}
