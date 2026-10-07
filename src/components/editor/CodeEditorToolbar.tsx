import {
  Button,
  ButtonGroup,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Tooltip
} from "@mui/material";
import cx from "classnames";
import { js as formatJs } from "js-beautify";
import {
  ReactElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import { KnownModalArgTypes, ModalConfigType } from "src/api/modal";
import { savedSpellToItemData } from "src/api/spells";
import { getPlayer } from "src/engine/util/levelUtil";
import { mutateLayout } from "src/engine/util/tabHelpers";
import { Ping } from "src/entities/spells/ping/Ping";
import { useAppSelector, useAppStore } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectScriptById } from "src/redux/scriptLibrary/selectors";
import { saveScript } from "src/redux/scriptLibrary/slice";
import { pushModal } from "src/redux/shared/actions";
import { selectCutsceneLocked } from "src/redux/status/selectors";
import {
  selectComponentConfigById,
  selectComponentConfigsByComponentName,
  selectEditorFontSize
} from "src/redux/ui/selectors";
import { adjustEditorFontSize, updateComponentState } from "src/redux/ui/slice";

import { GameControllerContext } from "../context/GameControllerContext";
import { Icon } from "../ui/icons/Icon";
import { ItemRenderer } from "../ui/item/ItemRenderer";
import "./CodeEditorToolbar.css";
import { useSpellContext, useSpellContextState } from "./codeEditorHooks";

export type CodeEditorToolbarProps = {
  tabId: string;
};

export function CodeEditorToolbar(props: CodeEditorToolbarProps) {
  const { tabId } = props;

  const { t } = useTranslation();
  const store = useAppStore();
  const controller = useContext(GameControllerContext);

  const componentState = useAppSelector((state) =>
    selectComponentConfigById<"codeEditor">(state, tabId)
  );
  const { editorId } = componentState ?? {};
  const editorState = useAppSelector((state) =>
    editorId ? selectScriptEditor(state, editorId) : null
  );

  const editorFontSize = useAppSelector(selectEditorFontSize);
  const cutsceneLocked = useAppSelector(selectCutsceneLocked);
  const spellCtx = useSpellContext(editorState?.runtimeId);
  const spellState = useSpellContextState(editorState?.runtimeId);

  const run = useCallback(async () => {
    spellCtx?.terminate();
    if (cutsceneLocked || !controller?.spellRuntime || !editorState) return;
    const level = controller?.level;
    const player = level ? getPlayer(level) : null;

    const newSpellCtx = await controller.spellRuntime.run(
      editorState?.code ?? null,
      player?.id
    );
    if (!newSpellCtx) return;

    // Update the current editor config to recognize the running spell.
    store.dispatch(
      upsertEditor({
        ...editorState,
        runtimeId: newSpellCtx.id
      })
    );

    // Spawn a console.
    const state = store.getState();
    const currentConsoles =
      selectComponentConfigsByComponentName(state)["console"] ?? [];
    const matchedConsoleConfig = currentConsoles.find(
      ([_, cfg]) => cfg.editorId === editorState.id
    );
    if (matchedConsoleConfig) {
      store.dispatch(
        updateComponentState([
          matchedConsoleConfig[0],
          {
            ...matchedConsoleConfig[1],
            spellContextId: newSpellCtx.id
          }
        ])
      );
    } else if (tabId) {
      mutateLayout(store, tabId)
        .openTab({
          relativePosition: "bottom",
          componentName: "console",
          componentConfig: {
            editorId: editorState.id,
            spellContextId: newSpellCtx.id
          }
        })
        .apply();
    }
  }, [store, controller, tabId, editorState, cutsceneLocked, spellCtx]);

  const stop = useCallback(() => spellCtx?.terminate(), [spellCtx]);
  const togglePause = useCallback(
    () => (spellState.paused ? spellCtx?.resume() : spellCtx?.pause()),
    [spellCtx, spellState]
  );
  const stepExecutation = useCallback(() => spellCtx?.step(), [spellCtx]);

  const save = useCallback(
    (saveAs?: boolean) => {
      if (editorState?.scriptId && !saveAs) {
        const state = store.getState();
        const script = selectScriptById(state, editorState.scriptId);
        if (!script) return;
        store.dispatch(
          saveScript({
            ...script,
            code: editorState.code ?? script.code
          })
        );
        return;
      }
      if (!editorState) return;
      store.dispatch(
        pushModal({
          modalName: "saveSpell",
          modalArg: {
            code: editorState.code ?? "",
            codeEditorId: editorState.id,
            existingSpell: editorState.savedSpellSnapshot
          }
        } satisfies ModalConfigType<"saveSpell">)
      );
    },
    [store, editorState]
  );

  const load = useCallback(() => {
    if (!editorState) return;
    store.dispatch(
      pushModal({
        modalName: "loadSpell",
        modalArg: {
          codeEditorId: editorState.id,
        }
      } satisfies ModalConfigType<"loadSpell">)
    );
  }, [store, editorState]);

  const format = useCallback(() => {
    if (!editorState) return;
    store.dispatch(
      upsertEditor({
        ...editorState,
        code: formatJs(editorState.code ?? "", {
          indent_size: 2,
          indent_with_tabs: false
        })
      })
    );
  }, [store, editorState]);

  const doPing = useCallback(() => {
    const level = controller?.level;
    if (!level) return;
    const player = getPlayer(level);
    if (!player) return;
    level.addEntity(
      new Ping({
        position: player.position.clone()
      })
    );
  }, [controller]);

  const [loadSaveVisible, setLoadSaveVisible] = useState(true);

  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <div className="code-editor-toolbar">
      <div
        className={cx("code-editor-toolbar-main", {
          running: spellState.running
        })}
      >
        <CodeEditorToolbarSection
          align="left"
          className={cx("code-editor-buttons-primary", {
            running: spellState.running
          })}
        >
          <div className={cx("buttons-group", { hidden: spellState.running })}>
            <Button
              color="primary"
              variant="contained"
              size="small"
              id="code-editor-run-button"
              data-testid="code-editor-run-button"
              onClick={run}
              disabled={spellState.running}
              startIcon={<Icon icon="doubleArrowFilled" size="font" />}
            >
              {t("codeEditor.run")}
            </Button>
          </div>
          <div className={cx("buttons-group", { hidden: !spellState.running })}>
            <Tooltip
              title={
                spellState.paused
                  ? t("codeEditor.resume")
                  : t("codeEditor.pause")
              }
            >
              <IconButton
                color="primary"
                size="small"
                id="code-editor-pause-button"
                data-testid="code-editor-pause-button"
                onClick={togglePause}
              >
                <Icon
                  icon={spellState.paused ? "doubleArrowFilled" : "pause"}
                  size="font"
                />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("codeEditor.step")}>
              <IconButton
                color="primary"
                size="small"
                id="code-editor-step-button"
                data-testid="code-editor-step-button"
                onClick={stepExecutation}
              >
                <Icon icon="stepForward" size="font" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("codeEditor.step")}>
              <IconButton
                color="primary"
                size="small"
                id="code-editor-stop-button"
                data-testid="code-editor-stop-button"
                onClick={stop}
              >
                <Icon icon="stop" size="font" />
              </IconButton>
            </Tooltip>
          </div>
        </CodeEditorToolbarSection>
        <CodeEditorToolbarSection className="code-editor-toolbar-current-spell">
          <>
            {editorState?.savedSpellSnapshot && (
              <div className="current-spell-item-preview">
                <ItemRenderer
                  item={savedSpellToItemData(editorState.savedSpellSnapshot)}
                />
              </div>
            )}
            <div className="current-spell-name">
              {editorState?.savedSpellSnapshot?.name ??
                // This particular fallback needs to go away,
                // but we're using it in the mobile demo.
                componentState?.scriptName ??
                t("codeEditor.newSpell")}
            </div>
          </>
        </CodeEditorToolbarSection>
        <CodeEditorToolbarSection
          align="right"
          enableHide
          setVisible={setLoadSaveVisible}
        >
          <Button
            color="secondary"
            variant="contained"
            size="small"
            id="code-editor-load-button"
            data-testid="code-editor-load-button"
            onClick={load}
          >
            {t("codeEditor.loadSpell")}
          </Button>
          <ButtonGroup size="small" variant="contained">
            <Button
              color="secondary"
              size="small"
              id="code-editor-load-button"
              data-testid="code-editor-load-button"
              onClick={() => {
                setSaveDropdownOpen(false);
                save();
              }}
            >
              {t("codeEditor.saveSpell")}
            </Button>
            <Button
              color="secondary"
              size="small"
              className="really-small-dropdown"
              onClick={(e) => {
                setMenuAnchor(e.currentTarget);
                setSaveDropdownOpen((v) => !v);
              }}
            >
              <Icon icon="chevronDown" size="font" />
            </Button>
          </ButtonGroup>
          <Menu
            anchorEl={menuAnchor}
            open={saveDropdownOpen}
            onClose={() => setSaveDropdownOpen(false)}
          >
            <MenuItem
              onClick={() => {
                setSaveDropdownOpen(false);
                save(true);
              }}
            >
              <ListItemText>{t("codeEditor.saveSpellAs")}</ListItemText>
            </MenuItem>
          </Menu>
        </CodeEditorToolbarSection>
      </div>
      <div className="code-editor-toolbar-hamburger">
        <IconButton
          color="secondary"
          size="medium"
          onClick={(e) => {
            setMenuAnchor(e.currentTarget);
            setHamburgerOpen((v) => !v);
          }}
        >
          <Icon icon="bars" size="font" />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={hamburgerOpen}
          onClose={() => setHamburgerOpen(false)}
        >
          {[
            ...(!loadSaveVisible
              ? [
                  <MenuItem
                    key="loadL"
                    onClick={() => {
                      setHamburgerOpen(false);
                      load();
                    }}
                  >
                    {t("codeEditor.loadSpell")}
                  </MenuItem>,
                  <MenuItem
                    key="save"
                    onClick={() => {
                      setHamburgerOpen(false);
                      save();
                    }}
                  >
                    {t("codeEditor.saveSpell")}
                  </MenuItem>,
                  <MenuItem
                    key="saveAs"
                    onClick={() => {
                      setHamburgerOpen(false);
                      save(true);
                    }}
                  >
                    {t("codeEditor.saveSpellAs")}
                  </MenuItem>
                ]
              : []),
            <MenuItem key="format" onClick={format}>
              <ListItemIcon>
                <Icon icon="format" size="font" />
              </ListItemIcon>
              <ListItemText>{t("codeEditor.format")}</ListItemText>
            </MenuItem>,
            <MenuItem key="ping" onClick={doPing}>
              <ListItemIcon>
                <Icon icon="insightSymbol" size="font" />
              </ListItemIcon>
              <ListItemText>{t("codeEditor.ping")}</ListItemText>
            </MenuItem>,
            <MenuItem
              key="fontSize"
              sx={{ display: "flex", gap: 1, alignItems: "center" }}
            >
              <ListItemText>{t("codeEditor.fontSize")}</ListItemText>
              <Slider
                size="small"
                min={10}
                max={32}
                value={editorFontSize}
                onChange={(_, v) =>
                  store.dispatch(adjustEditorFontSize(Number(v)))
                }
                sx={{ width: 100 }}
              />
              <span style={{ minWidth: 24, textAlign: "right", fontSize: 12 }}>
                {editorFontSize}
              </span>
            </MenuItem>
          ]}
        </Menu>
      </div>
    </div>
  );
}

type CodeEditorToolbarSectionProps = {
  className?: string;
  children: ReactElement | ReactElement[];
  align?: "left" | "right";
  enableHide?: boolean;
  setVisible?: (visible: boolean) => void;
};

function CodeEditorToolbarSection(props: CodeEditorToolbarSectionProps) {
  const { className, children, align, enableHide, setVisible } = props;

  const [contentsHidden, setContentsHidden] = useState(true);
  const setVisibleRef = useRef<typeof setVisible>(setVisible);
  setVisibleRef.current = setVisible;

  const wrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl || !enableHide) return;

    const onUpdateIntersect: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        const fullyVisible = entry.intersectionRatio === 1;
        setContentsHidden(!fullyVisible);
        setVisibleRef.current?.(fullyVisible);
      }
    };

    const intersect = new IntersectionObserver(onUpdateIntersect, {
      root: wrapperEl.parentElement,
      rootMargin: "0px",
      threshold: 1.0
    });
    intersect.observe(wrapperEl);
    return () => intersect.disconnect();
  }, [enableHide]);

  return (
    <div
      ref={wrapperRef}
      className={cx("code-editor-toolbar-section", className, {
        "align-right": align === "right",
        "contents-hidden": enableHide && contentsHidden
      })}
    >
      {children}
    </div>
  );
}
