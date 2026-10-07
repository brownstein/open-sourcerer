import { DocId } from "src/docs/indexedDocs/docTypes";
import { useAppSelector } from "src/redux/hooks";
import { selectViewedPercentageForDoc } from "src/redux/progression/selectors";

export function useDocViewPercentage(docId: DocId) {
  return useAppSelector((state) => selectViewedPercentageForDoc(state, docId));
}
