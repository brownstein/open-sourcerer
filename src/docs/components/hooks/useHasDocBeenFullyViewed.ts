import { DocId } from "src/docs/indexedDocs/docTypes";
import { useAppSelector } from "src/redux/hooks";
import { selectHasDocBeenFullyViewed } from "src/redux/progression/selectors";

export function useHasDocBeenFullyViewed(docId: DocId) {
  return useAppSelector((state) => selectHasDocBeenFullyViewed(state, docId));
}
