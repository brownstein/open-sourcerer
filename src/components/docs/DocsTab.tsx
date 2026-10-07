import { Box } from "@mui/material";
import { debounce } from "debounce";
import {
  UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { clamp } from "three/src/math/MathUtils.js";

import { FALLBACK_LOCALE } from "src/docs/configuration";
import { DocId, LocaleCode } from "src/docs/indexedDocs/docTypes";
import { mdxComponents } from "src/docs/mdxComponents";
import { acknowledgeOpenDoc } from "src/redux/docsNav/slice";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { setDocsViewedPercentage, viewDoc } from "src/redux/progression/slice";

import { useTabState } from "../context/UITabContext";
import { UIComponentProps } from "../ui/config/types";
import { DocsEntry } from "./DocsEntry/DocsEntry";
import { DocsHeader } from "./DocsHeader/DocsHeader";
import "./DocsTab.less";

const DEFAULT_DOC_ID: DocId = "index";

export type DocsTabProps = UIComponentProps<"docs">;

export function DocsTab(_props: DocsTabProps) {
  const dispatch = useAppDispatch();

  const language = useAppSelector((state) => state.settings.language);
  const pendingDocId = useAppSelector((state) => state.docsNav.pending?.docId);
  const pendingAnchorId = useAppSelector(
    (state) => state.docsNav.pending?.anchorId
  );
  const pendingRequestId = useAppSelector(
    (state) => state.docsNav.pending?.requestId
  );

  const [docsTabState, setDocsTabState] = useTabState<"docs">();

  const docId = docsTabState?.docId ?? DEFAULT_DOC_ID;
  const query = docsTabState?.query ?? "";
  const initialScrollPosition = docsTabState?.scrollPosition ?? 0;
  const navHistory = docsTabState?.navHistory ?? ["index"];
  const navHistoryIndex = docsTabState?.navHistoryIndex ?? 0;
  const highlightNavIndex = docsTabState?.highlightNavIndex ?? 0;

  const setDocId = useCallback(
    (docId: DocId) =>
      setDocsTabState((prev) => {
        if (prev?.docId === docId) return prev;

        return { ...prev, docId };
      }),
    [setDocsTabState]
  );

  const setQuery = useCallback(
    (query: string) =>
      setDocsTabState((prev) => {
        if (prev?.query === query) return prev;

        return { ...prev, query };
      }),
    [setDocsTabState]
  );

  const navigateHistory = useCallback(
    (delta: -1 | 1) =>
      setDocsTabState((prev) => {
        const navHistory = prev?.navHistory ?? ["index"];
        const navIndex = prev?.navHistoryIndex ?? 0;
        const newIndex = clamp(navIndex + delta, 0, navHistory.length - 1);

        if (prev?.navHistoryIndex === newIndex) return prev;

        return {
          ...prev,
          navHistoryIndex: newIndex,
          docId: navHistory[newIndex]
        };
      }),
    [setDocsTabState]
  );

  const handleBackwardsNav = useCallback(
    () => navigateHistory(-1),
    [navigateHistory]
  );

  const handleForwardsNav = useCallback(
    () => navigateHistory(1),
    [navigateHistory]
  );

  const addDocToNavHistory = useCallback(
    (docId: DocId) =>
      setDocsTabState((prev) => {
        const prevNavHistory = prev?.navHistory ?? ["index"];
        const navHistoryIndex = prev?.navHistoryIndex ?? 0;

        if (prevNavHistory[navHistoryIndex] === docId) return prev ?? {};

        const newNavHistory = [
          ...prevNavHistory.slice(0, navHistoryIndex + 1),
          docId
        ];

        return {
          ...prev,
          navHistory: newNavHistory,
          navHistoryIndex: newNavHistory.length - 1
        };
      }),
    [setDocsTabState]
  );

  const setHighlightNavIndex = useCallback(
    (index: number) =>
      setDocsTabState((prev) => {
        if (prev?.highlightNavIndex === index) return prev;

        return { ...prev, highlightNavIndex: index };
      }),
    [setDocsTabState]
  );

  const [anchorId, setAnchorId] = useState<string | undefined>(undefined);
  const [navigationRequestId, setNavigationRequestId] = useState<
    string | undefined
  >(undefined);

  const [backwardsHighlightNavHandler, setBackwardsHighlightNavHandler] =
    useState({ fn: () => {} });
  const [forwardsHighlightNavHandler, setForwardsHighlightNavHandler] =
    useState({ fn: () => {} });

  const registerBackwardsHighlightNavHandler = useCallback(
    (cb: () => void) => setBackwardsHighlightNavHandler({ fn: cb }),
    [setBackwardsHighlightNavHandler]
  );
  const registerForwardsHighlightNavHandler = useCallback(
    (cb: () => void) => setForwardsHighlightNavHandler({ fn: cb }),
    [setForwardsHighlightNavHandler]
  );

  const docsEntryElement = useRef<HTMLDivElement>(null);
  const currentScrollPosition = useRef(initialScrollPosition);

  useLayoutEffect(() => {
    const el = docsEntryElement.current;
    if (!el) return;
    el.scrollTop = initialScrollPosition;
  }, []);

  const updateScrollPosition = useCallback(
    debounce((scrollPos: number, scrollPercentage: number) => {
      currentScrollPosition.current = scrollPos;
      dispatch(setDocsViewedPercentage([docId, scrollPercentage]));
    }, 250),
    [docId, dispatch]
  );

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      updateScrollPosition(scrollTop, scrollPercentage);
    },
    [updateScrollPosition]
  );

  useEffect(() => {
    return () => {
      setDocsTabState((prev) => ({
        ...prev,
        scrollPosition: currentScrollPosition.current
      }));
    };
  }, [setDocsTabState]);

  useEffect(() => {
    if (!pendingRequestId || !pendingDocId) return;

    setDocId(pendingDocId);
    setAnchorId(pendingAnchorId);
    setNavigationRequestId(pendingRequestId);

    addDocToNavHistory(pendingDocId);

    dispatch(acknowledgeOpenDoc({ requestId: pendingRequestId }));
  }, [pendingDocId, pendingAnchorId, pendingRequestId, dispatch]);

  useEffect(() => {
    dispatch(viewDoc(docId));

    const el = docsEntryElement.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    updateScrollPosition(scrollTop, scrollPercentage);
  }, [docId, dispatch, updateScrollPosition]);

  const locale = (language || FALLBACK_LOCALE) as LocaleCode;

  return (
    <Box
      className="docs-tab"
      sx={{ bgcolor: "background.default", color: "text.primary" }}
    >
      <DocsHeader
        docId={docId}
        locale={locale}
        query={query}
        setQuery={setQuery}
        onBackwardsNav={handleBackwardsNav}
        onForwardsNav={handleForwardsNav}
        canBackwardsNav={navHistoryIndex > 0}
        canForwardsNav={navHistoryIndex < navHistory.length - 1}
        onBackwardsHighlightNav={() => backwardsHighlightNavHandler.fn()}
        onForwardsHighlightNav={() => forwardsHighlightNavHandler.fn()}
      />
      <Box
        className="docs-entry-scroll"
        ref={docsEntryElement}
        onScroll={handleScroll}
      >
        <DocsEntry
          docId={docId}
          locale={locale}
          anchorId={anchorId}
          components={mdxComponents}
          navigationRequestId={navigationRequestId}
          highlightQuery={query.trim()}
          setBackwardsNavHighlightHandler={registerBackwardsHighlightNavHandler}
          setForwardsNavHighlightHandler={registerForwardsHighlightNavHandler}
          highlightNavIndex={highlightNavIndex}
          setHighlightNavIndex={setHighlightNavIndex}
        />
      </Box>
    </Box>
  );
}
