import { TutorialId } from "src/components/tutorials/tutorials/allTutorials";
import { useAppSelector } from "src/redux/hooks";
import { selectCurrentTutorialId } from "src/redux/ui/selectors";

export function useCurrentTutorialEquals(tutorialId: TutorialId) {
  return useAppSelector(selectCurrentTutorialId) === tutorialId;
}
