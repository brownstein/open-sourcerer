import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  SEARCH_FUZZY_FACTOR,
  SHOULD_SEARCH_PREFIX
} from "src/docs/configuration";
import { PhraseSearch } from "src/docs/phraseSearch";

const PHRASE_SEARCH_INDEXED_COMPONENT_ID = "phrase-search-indexed-component";

type DomTextSegment = {
  textNode: Text;
  startCharOffsetInFlattenedText: number;
  endCharOffsetInFlattenedText: number;
};

type SegmentedDomText = {
  flattenedDomText: string;
  segments: DomTextSegment[];
};

type PhraseSearchIndexedComponent = {
  id: string;
  content: string;
};

type CurrentPhraseSearchHighlighterState = SegmentedDomText & {
  phraseSearchEngine: PhraseSearch<PhraseSearchIndexedComponent>;
};

function extractSegmentedDomText(rootElement: Element): SegmentedDomText {
  const segments: DomTextSegment[] = [];
  const textParts: string[] = [];
  let cursor = 0;

  const treeWalker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT
  );

  let node = treeWalker.nextNode() as Text | null;
  while (node) {
    const text = node.data;
    if (text.length > 0) {
      segments.push({
        textNode: node,
        startCharOffsetInFlattenedText: cursor,
        endCharOffsetInFlattenedText: cursor + text.length
      });
      textParts.push(text);
      cursor += text.length;
    }
    node = treeWalker.nextNode() as Text | null;
  }

  return { flattenedDomText: textParts.join(""), segments };
}

function buildSearchEngineForIndexedComponent(
  flattenedDomText: string
): PhraseSearch<PhraseSearchIndexedComponent> {
  return new PhraseSearch<PhraseSearchIndexedComponent>({
    idField: "id",
    fields: ["content"],
    phraseSearchField: "content",
    documentsToSearch: [
      { id: PHRASE_SEARCH_INDEXED_COMPONENT_ID, content: flattenedDomText }
    ],
    searchOptions: {
      prefix: SHOULD_SEARCH_PREFIX,
      fuzzy: SEARCH_FUZZY_FACTOR
    }
  });
}

function findSegmentForFlattendDomTextCharOffset(
  segments: DomTextSegment[],
  charOffset: number
): { segment: DomTextSegment; offsetInNode: number } | null {
  if (segments.length === 0) return null;

  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const segment = segments[mid];
    if (charOffset < segment.startCharOffsetInFlattenedText) hi = mid - 1;
    else if (charOffset >= segment.endCharOffsetInFlattenedText) lo = mid + 1;
    else
      return {
        segment,
        offsetInNode: charOffset - segment.startCharOffsetInFlattenedText
      };
  }

  // phrase end segment offsets are not included in range
  const lastSegment = segments[segments.length - 1];
  if (charOffset === lastSegment.endCharOffsetInFlattenedText) {
    return {
      segment: lastSegment,
      offsetInNode:
        lastSegment.endCharOffsetInFlattenedText -
        lastSegment.startCharOffsetInFlattenedText
    };
  }

  return null;
}

function findNearestScrollableAncestor(
  element: Element | null
): Element | null {
  let current = element?.parentElement ?? null;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// i've lost my mind
function buildDomRangeForFlattenedDomTextCharacterOffsetRanges(
  startCharOffset: number,
  endCharOffset: number,
  segments: DomTextSegment[]
): Range | null {
  const startLocation = findSegmentForFlattendDomTextCharOffset(
    segments,
    startCharOffset
  );
  const endLocation = findSegmentForFlattendDomTextCharOffset(
    segments,
    endCharOffset
  );
  if (!startLocation || !endLocation) return null;

  const range = document.createRange();
  range.setStart(startLocation.segment.textNode, startLocation.offsetInNode);
  range.setEnd(endLocation.segment.textNode, endLocation.offsetInNode);
  return range;
}

export type PhraseSearchHighlighterProps = {
  query: string;
  children: ReactNode;
  highlightKey: string;
  focusedHighlightIndex?: number;
  setFocusedHighlightIndex?: (index: number) => void;
  focusedHighlightKey?: string;
  focusNearestMatchBelowElementOnNextSearch?: Element;
  setHighlightForwardsNavHandler?: (cb: () => void) => void;
  setHighlightBackwardsNavHandler?: (cb: () => void) => void;
};

export function PhraseSearchHighlighter(props: PhraseSearchHighlighterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentHighlighterState, setCurrentHighlighterState] =
    useState<CurrentPhraseSearchHighlighterState | null>(null);

  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;

    let isMutationProcessingScheduled = false;

    const reconcileCurrentHighlighterState = () => {
      const stillMountedContainer = containerRef.current;
      if (!stillMountedContainer) return;

      const { flattenedDomText, segments } = extractSegmentedDomText(
        stillMountedContainer
      );

      setCurrentHighlighterState((previousState) => {
        if (
          previousState &&
          previousState.flattenedDomText === flattenedDomText
        ) {
          // NOTE: always refresh segments so future ranges
          // target whatever text nodes are live right now. very little cost anyway
          return { ...previousState, segments };
        }

        const phraseSearchEngine =
          buildSearchEngineForIndexedComponent(flattenedDomText);
        return { flattenedDomText, segments, phraseSearchEngine };
      });
    };

    const scheduleReconciliation = () => {
      if (isMutationProcessingScheduled) return;
      isMutationProcessingScheduled = true;
      queueMicrotask(() => {
        isMutationProcessingScheduled = false;
        reconcileCurrentHighlighterState();
      });
    };

    // initial extraction once the wrapper exists
    reconcileCurrentHighlighterState();

    const mutationObserver = new MutationObserver(scheduleReconciliation);
    mutationObserver.observe(containerElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => mutationObserver.disconnect();
  }, []);

  const highlightDomRanges = useMemo(() => {
    if (!currentHighlighterState) return [];

    const trimmedQuery = props.query.trim();
    if (!trimmedQuery) return [];

    const ranges: Range[] = [];
    const phraseSearchResults =
      currentHighlighterState.phraseSearchEngine.search(trimmedQuery);
    for (const result of phraseSearchResults) {
      for (const matchedPhrase of result.matchedPhrases) {
        const range = buildDomRangeForFlattenedDomTextCharacterOffsetRanges(
          matchedPhrase.startCharOffset,
          matchedPhrase.endCharOffset,
          currentHighlighterState.segments
        );
        if (range) ranges.push(range);
      }
    }

    return ranges;
  }, [currentHighlighterState, props.query]);

  const [nearestScrollableAncestor, setNearestScrollableAncestor] =
    useState<Element | null>(null);
  useEffect(() => {
    setNearestScrollableAncestor(
      findNearestScrollableAncestor(containerRef.current)
    );
  }, []);

  // this prop is meant to only work on the very next search
  const anchorElementForNextAutoscrollProp =
    props.focusNearestMatchBelowElementOnNextSearch;

  const [anchorElementForNextAutoscroll, setAnchorElementForNextAutoscroll] =
    useState<Element | undefined>(anchorElementForNextAutoscrollProp);

  // NOTE: we introduced auto-scrolling functionality, but we want to guard
  // against this auto-scrolling from firing from unwanted sources (such as
  // child DOM mutations). This will be hardwired, since this is an important
  // user interaction to make sure autoscrolling does not get set off when
  // the player does not want it. We will "gate" autoscrolling
  const [
    previousAnchorPropForScrollGating,
    setPreviousAnchorPropForScrollGating
  ] = useState<Element | undefined>(anchorElementForNextAutoscrollProp);
  const [previousQueryForScrollGating, setPreviousQueryForScrollGating] =
    useState<string>(props.query);

  const [shouldScrollOnNextAutoscroll, setShouldScrollOnNextAutoscroll] =
    useState<boolean>(() => anchorElementForNextAutoscrollProp !== undefined);

  const [autoscrollExecutionId, setAutoscrollExecutionId] = useState(0);

  if (
    anchorElementForNextAutoscrollProp !== previousAnchorPropForScrollGating
  ) {
    setPreviousAnchorPropForScrollGating(anchorElementForNextAutoscrollProp);
    setAnchorElementForNextAutoscroll(anchorElementForNextAutoscrollProp);
    setShouldScrollOnNextAutoscroll(true);
  }
  if (props.query !== previousQueryForScrollGating) {
    setPreviousQueryForScrollGating(props.query);
    setShouldScrollOnNextAutoscroll(true);
  }

  const [internalFocusedHighlightIndex, setInternalFocusedHighlightIndex] =
    useState(props.focusedHighlightIndex ?? 0);
  const isFocusedHighlightIndexControlled =
    props.focusedHighlightIndex !== undefined &&
    props.setFocusedHighlightIndex !== undefined;
  const focusedHighlightIndex = isFocusedHighlightIndexControlled
    ? props.focusedHighlightIndex!
    : internalFocusedHighlightIndex;
  const setFocusedHighlightIndex = isFocusedHighlightIndexControlled
    ? props.setFocusedHighlightIndex!
    : setInternalFocusedHighlightIndex;

  useEffect(() => {
    if (highlightDomRanges.length === 0) {
      setFocusedHighlightIndex(props.focusedHighlightIndex ?? 0);
      setAutoscrollExecutionId((id) => id + 1);
      return;
    }

    if (!shouldScrollOnNextAutoscroll) {
      // no intent to scroll: preserve the current focused index (which may
      // be a persisted/restored one)
      if (focusedHighlightIndex >= highlightDomRanges.length)
        setFocusedHighlightIndex(0);

      setAutoscrollExecutionId((id) => id + 1);
      return;
    }

    const elementToFocusNear = anchorElementForNextAutoscroll;
    const focusBelowOrNearYCoordinate =
      elementToFocusNear?.getBoundingClientRect().top ??
      nearestScrollableAncestor?.getBoundingClientRect().top ??
      0;

    let nearestMatchedRangeIndexAboveTarget: number | null = null;
    let nearestMatchedYDistanceAboveTarget = Infinity;
    let firstMatchedRangeIndexAtOrBelowTarget: number | null = null;
    for (const [rangeIndex, range] of highlightDomRanges.entries()) {
      const rangeTopYCoord = range.getBoundingClientRect().top;
      const yDistance = rangeTopYCoord - focusBelowOrNearYCoordinate;
      if (yDistance >= 0) {
        firstMatchedRangeIndexAtOrBelowTarget = rangeIndex;
        break;
      }
      const absYDistance = -yDistance;
      if (absYDistance < nearestMatchedYDistanceAboveTarget) {
        nearestMatchedYDistanceAboveTarget = absYDistance;
        nearestMatchedRangeIndexAboveTarget = rangeIndex;
      }
    }

    const matchedRangeIndex =
      firstMatchedRangeIndexAtOrBelowTarget ??
      nearestMatchedRangeIndexAboveTarget;
    if (matchedRangeIndex === null) return;

    setFocusedHighlightIndex(matchedRangeIndex);
    setAutoscrollExecutionId((id) => id + 1);

    if (anchorElementForNextAutoscroll) {
      setAnchorElementForNextAutoscroll(undefined);
    }
  }, [highlightDomRanges]);

  // scroll when the autoscroll ID goes up
  useEffect(() => {
    if (!shouldScrollOnNextAutoscroll) return;
    if (highlightDomRanges.length === 0) return;

    const focusedRange = highlightDomRanges[focusedHighlightIndex];
    if (!focusedRange) return;

    const ancestorRangeNode = focusedRange.commonAncestorContainer;
    const element =
      ancestorRangeNode.nodeType === Node.ELEMENT_NODE
        ? (ancestorRangeNode as Element)
        : ancestorRangeNode.parentElement;

    if (!element) return;

    element.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
    setShouldScrollOnNextAutoscroll(false);
  }, [autoscrollExecutionId]);

  const { setHighlightBackwardsNavHandler, setHighlightForwardsNavHandler } =
    props;

  const navigateHighlightedRanges = useCallback(
    (delta: -1 | 1) => {
      const itemCount = highlightDomRanges.length;
      if (itemCount === 0) return;

      const newIndex = focusedHighlightIndex + delta;
      const wrappedIndex = ((newIndex % itemCount) + itemCount) % itemCount;
      setFocusedHighlightIndex(wrappedIndex);
      setShouldScrollOnNextAutoscroll(true);
      setAutoscrollExecutionId((id) => id + 1);
    },
    [highlightDomRanges, focusedHighlightIndex, setFocusedHighlightIndex]
  );

  useEffect(() => {
    setHighlightBackwardsNavHandler?.(() => navigateHighlightedRanges(-1));
    setHighlightForwardsNavHandler?.(() => navigateHighlightedRanges(1));
  }, [
    setHighlightBackwardsNavHandler,
    setHighlightForwardsNavHandler,
    navigateHighlightedRanges
  ]);

  const highlightKey = props.highlightKey;
  useEffect(() => {
    if (highlightDomRanges.length === 0) {
      CSS.highlights.delete(highlightKey);
      return;
    }

    CSS.highlights.set(highlightKey, new Highlight(...highlightDomRanges));

    return () => {
      CSS.highlights.delete(highlightKey);
    };
  }, [highlightDomRanges, highlightKey]);

  const focusedHighlightKey = props.focusedHighlightKey;
  useEffect(() => {
    if (focusedHighlightKey === undefined) return;
    if (highlightDomRanges.length === 0) return;

    const focusedRange = highlightDomRanges[focusedHighlightIndex];
    if (!focusedRange) return;

    CSS.highlights.delete(focusedHighlightKey);
    CSS.highlights.set(focusedHighlightKey, new Highlight(focusedRange));

    return () => {
      CSS.highlights.delete(focusedHighlightKey);
    };
  }, [highlightDomRanges, focusedHighlightIndex, focusedHighlightKey]);

  return <div ref={containerRef}>{props.children}</div>;
}
