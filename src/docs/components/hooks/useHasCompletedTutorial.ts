import { TutorialId } from "src/components/tutorials/tutorials/allTutorials";
import { useAppSelector } from "src/redux/hooks";
import { selectTutorialCompleted } from "src/redux/progression/selectors";

export function useHasCompletedTutorial(tutorialId: TutorialId) {
  return useAppSelector((state) => selectTutorialCompleted(state, tutorialId));
}
