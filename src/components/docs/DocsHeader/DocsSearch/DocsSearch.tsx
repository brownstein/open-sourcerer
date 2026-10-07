import {
  Box,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListSubheader,
  Paper,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  ChangeEvent,
  FocusEvent,
  Fragment,
  KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { DocsSearchResult } from "src/api/docs";
import { Icon } from "src/components/ui/icons/Icon";
import { LocaleCode } from "src/docs/indexedDocs/docTypes";
import { groupSearchResultsByDoc, searchDocs } from "src/docs/searchEngine";
import { openDocAt } from "src/redux/docsNav/slice";
import { useAppDispatch } from "src/redux/hooks";

import "./DocsSearch.less";
import { DocsSearchNavigator } from "./DocsSearchNavigator/DocsSearchNavigator";

const TRANSITION_MS = 250;

type ExpansionState =
  | "collapsed"
  | "expanded-focused"
  | "expanded-with-navigator";

export type DocsSearchProps = {
  locale: LocaleCode;
  query: string;
  setQuery: (query: string) => void;
  onExpansionChange: (isExpanded: boolean) => void;
  onBackwardsHighlightNav: () => void;
  onForwardsHighlightNav: () => void;
};

export function DocsSearch(props: DocsSearchProps) {
  const dispatch = useAppDispatch();

  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [expansionState, setExpansionState] = useState<ExpansionState>(
    props.query ? "expanded-with-navigator" : "collapsed"
  );

  const isExpanded = expansionState !== "collapsed";
  const showNavigator = expansionState === "expanded-with-navigator";

  const deferredQuery = useDeferredValue(props.query);
  const trimmedDeferredQuery = deferredQuery.trim();

  const results = useMemo(
    () => searchDocs(deferredQuery, props.locale),
    [deferredQuery, props.locale]
  );

  const groupedResults = useMemo(
    () => groupSearchResultsByDoc(results),
    [results]
  );

  const onExpansionChange = props.onExpansionChange;
  useEffect(() => {
    onExpansionChange?.(isExpanded);
  }, [isExpanded, onExpansionChange]);

  const handleToggle = useCallback(() => {
    if (isExpanded) {
      setExpansionState("collapsed");
      props.setQuery("");
    } else {
      setExpansionState("expanded-focused");

      // defer the focusing because this causes ssome weird conflict with native focusing on button press
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isExpanded, props.setQuery]);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      props.setQuery(event.target.value);
    },
    [props.setQuery]
  );

  const handleInputFocus = useCallback(() => {
    setExpansionState("expanded-focused");
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      // trigger has its own click handler that decides next state

      if (event.relatedTarget === triggerRef.current) return;
      setExpansionState(
        props.query.trim().length === 0
          ? "collapsed"
          : "expanded-with-navigator"
      );
    },
    [props.query]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        setExpansionState("collapsed");
        props.setQuery("");
      }
    },
    [props.setQuery]
  );

  const handleResultClick = useCallback(
    (result: DocsSearchResult) => {
      dispatch(
        openDocAt({
          docId: result.docId,
          anchorId: result.headerId as any,
          shouldHighlight: true
        })
      );
      setExpansionState("expanded-with-navigator");
    },
    [dispatch]
  );

  const showResults =
    expansionState === "expanded-focused" && trimmedDeferredQuery.length > 0;
  const hasResults = groupedResults.length > 0;

  const triggerLabel = isExpanded ? "Close search" : "Search docs";

  return (
    <>
      <Box
        className="docs-search-input-cell"
        data-expanded={isExpanded}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        <Box
          className="docs-search-input-clipper"
          sx={{ bgcolor: "background.default" }}
        >
          <Box className="docs-search-input-content">
            <Collapse
              in={showNavigator}
              orientation="horizontal"
              timeout={TRANSITION_MS}
              collapsedSize={0}
            >
              <Box sx={{ pr: "0.25rem" }}>
                <DocsSearchNavigator
                  onBackwardsHighlightNav={props.onBackwardsHighlightNav}
                  onForwardsHighlightNav={props.onForwardsHighlightNav}
                />
              </Box>
            </Collapse>

            <Box className="docs-search-input-field">
              <TextField
                inputRef={inputRef}
                type="text"
                size="small"
                fullWidth
                placeholder="Search docs"
                value={props.query}
                onChange={handleQueryChange}
                onFocus={handleInputFocus}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Icon icon="searchFilled" size="font" />
                      </InputAdornment>
                    ),
                    tabIndex: isExpanded ? 0 : -1
                  }
                }}
              />
            </Box>
          </Box>
        </Box>

        {showResults && (
          <Paper className="docs-search-input-results" elevation={6}>
            {hasResults ? (
              <List dense disablePadding>
                {groupedResults.map((group, groupIndex) => (
                  <Fragment key={group.docId}>
                    {groupIndex > 0 && <Divider component="li" />}
                    <ListSubheader
                      disableSticky
                      sx={{
                        bgcolor: "transparent",
                        color: "text.secondary",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        lineHeight: 1.8,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase"
                      }}
                    >
                      {group.docTitle}
                    </ListSubheader>
                    {group.results.map((result) => (
                      <ListItemButton
                        key={result.rawIndexChunk.chunkId}
                        onClick={() => handleResultClick(result)}
                        sx={{ px: 2, py: 0.5 }}
                      >
                        <Typography variant="body2" noWrap>
                          {result.rawIndexChunk.heading}
                        </Typography>
                      </ListItemButton>
                    ))}
                  </Fragment>
                ))}
              </List>
            ) : (
              <Box className="docs-search-input-results-empty">
                <Typography variant="body2" color="text.secondary">
                  No results for "{trimmedDeferredQuery}"
                </Typography>
              </Box>
            )}
          </Paper>
        )}
      </Box>

      <Box className="docs-search-trigger-cell">
        <Tooltip title={triggerLabel} arrow>
          <IconButton
            ref={triggerRef}
            className="docs-search-trigger"
            size="small"
            onClick={handleToggle}
          >
            <Icon
              icon={isExpanded ? "closeFilled" : "searchFilled"}
              size="font"
            />
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
}
