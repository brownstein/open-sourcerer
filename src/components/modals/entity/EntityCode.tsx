import {
  Box,
  Button,
  Checkbox,
  Input,
  MenuItem,
  Select,
  Slider
} from "@mui/material";
import {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import shortid from "shortid";

import { coercePrimitive } from "src/api/data";
import {
  entityAcceptsCode,
  entityAcceptsPromptResult
} from "src/api/entityCodeInjection";
import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { CodingChallengeContent } from "src/challenges/content/CodingChallengeContent";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { CodeEditorTextEditor } from "src/components/editor/CodeEditorTextEditor";
import { BaseModal, BaseModalProps } from "src/components/modals/BaseModal";
import { Icon } from "src/components/ui/icons/Icon";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectEditorFontSize } from "src/redux/ui/selectors";
import { closeCurrentModal, updateModalInStack } from "src/redux/ui/slice";

import "./EntityCode.css";

type ModalSize = BaseModalProps["size"];

export type EntityCodeModalProps = ModalComponentPropsType<"entityCode">;

export function EntityCodeModal(props: EntityCodeModalProps) {
  const { id, modalArg, opening, closing } = props;
  const {
    titleKey,
    titleString,
    entityId,
    promptName,
    promptString,
    presetCode,
    currentCode,
    editorId,
    inputVariables,
    outputVariables,
    immutable,
    valueEditor
  } = modalArg;
  const { t } = useTranslation();
  const controller = useContext(GameControllerContext);
  const dispatch = useAppDispatch();
  const editor = useAppSelector((state) =>
    editorId ? selectScriptEditor(state, editorId) : undefined
  );
  const [promptResult, setPromptResult] = useState<string | null>(() =>
    valueEditor?.value === undefined || valueEditor.value === null
      ? null
      : coercePrimitive("string", valueEditor.value)
  );

  useEffect(() => {
    if (editorId) return;
    const newEditorId = shortid();
    dispatch(
      upsertEditor({
        id: newEditorId,
        code: currentCode ?? presetCode
      })
    );
    dispatch(
      updateModalInStack({
        id,
        modalName: "entityCode",
        modalArg: {
          ...modalArg,
          editorId: newEditorId
        }
      })
    );
  }, [id, modalArg, editorId, presetCode, currentCode]);

  // Mirror `currentCode ?? presetCode` into the live editor state whenever it
  // changes via updateModalInStack. The editor's own state is intentionally
  // not a dep: re-running on the user's typing would echo modalArg's stale
  // value back and wipe what they just typed.
  useEffect(() => {
    if (!editorId) return;
    const codeToShow = currentCode ?? presetCode;
    if (codeToShow === undefined) return;
    dispatch(
      upsertEditor({
        id: editorId,
        code: codeToShow
      })
    );
  }, [currentCode, presetCode, editorId, dispatch]);

  const onSubmit = useCallback<React.MouseEventHandler>(
    (e) => {
      const { code } = editor ?? {};
      if (code === undefined && promptResult === undefined) return;
      const level = controller?.level;
      const entity = level?.getEntity(entityId);
      if (!entity) return;
      if (entityAcceptsCode(entity) && code !== undefined) {
        entity.acceptCode(code);
      }
      if (entityAcceptsPromptResult(entity) && promptResult !== null) {
        entity.acceptPromptResult(promptResult);
      }
      dispatch(closeCurrentModal());
    },
    [dispatch, controller, editor, entityId, promptResult]
  );

  const onReset = useCallback(() => {
    if (!editorId || presetCode === undefined) return;
    dispatch(upsertEditor({ id: editorId, code: presetCode }));
  }, [dispatch, editorId, presetCode]);

  const [containerRef, containerSize] = useMeasureSize<HTMLDivElement>();
  const [prefaceRef, prefaceSize] = useMeasureSize<HTMLDivElement>();
  const [modalSize, setModalSize] = useState<ModalSize>(
    modalArg.initialSize ?? "small"
  );
  const [sizeResolved, setSizeResolved] = useState(false);

  const editorFontSize = useAppSelector(selectEditorFontSize);
  const codeLineCount = valueEditor
    ? 0
    : (currentCode ?? presetCode)?.split("\n").length ?? 0;
  const editorHeightEstimate = codeLineCount * editorFontSize * 1.4;

  useLayoutEffect(() => {
    if (containerSize.height === 0) return;
    if (containerSize.height < prefaceSize.height + editorHeightEstimate + 80) {
      switch (modalSize) {
        case "small":
          setModalSize("medium");
          return;
        case "medium":
          setModalSize("large");
          return;
        default:
          break;
      }
    }
    setSizeResolved(true);
  }, [containerSize, prefaceSize, modalSize, editorHeightEstimate]);

  const prefaceContent = promptName ? (
    <CodingChallengeContent contentName={promptName} />
  ) : (
    promptString ?? null
  );

  const variablesContent = useMemo(() => {
    if (!inputVariables?.length && !outputVariables?.length) return null;
    return (
      <div className="entity-code-modal-variables">
        <div>
          <h4>Input Variables</h4>
          <ul>{inputVariables?.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
        <div>
          <h4>Output Variables</h4>
          <ul>{outputVariables?.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
      </div>
    );
  }, [inputVariables, outputVariables]);

  let valueEditorContent: ReactNode;
  if (valueEditor) {
    const locked = valueEditor.locked;
    let input: ReactNode;
    switch (valueEditor.kind) {
      case "choices": {
        // blank when the value isn't a listed option, else MUI warns
        const { choices } = valueEditor;
        const selected = choices.some((c) => c.value === promptResult)
          ? promptResult ?? ""
          : "";
        input = (
          <Select
            value={selected}
            size="small"
            displayEmpty
            disabled={locked}
            onChange={(e) => {
              if (e.target.value) setPromptResult(e.target.value);
            }}
          >
            <MenuItem value="" disabled>
              <em>Pick a value</em>
            </MenuItem>
            {choices.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
        );
        break;
      }
      case "number":
        input = valueEditor.range ? (
          <Box sx={{ px: 1, width: 240 }}>
            <Slider
              value={coercePrimitive("number", promptResult)}
              min={valueEditor.range.min}
              max={valueEditor.range.max}
              step={valueEditor.range.step ?? 1}
              marks
              valueLabelDisplay={locked ? "on" : "auto"}
              disabled={locked}
              onChange={(_event, next) => setPromptResult(String(next))}
            />
          </Box>
        ) : (
          <Input
            type="number"
            value={coercePrimitive("number", promptResult)}
            disabled={locked}
            onChange={(e) => setPromptResult(String(Number(e.target.value)))}
            size="medium"
            color="primary"
          />
        );
        break;
      case "boolean": {
        const checked = coercePrimitive("boolean", promptResult);
        input = (
          <div>
            <Checkbox
              checked={checked}
              disabled={locked}
              onChange={() =>
                checked ? setPromptResult("false") : setPromptResult("true")
              }
            />{" "}
            boolean value
          </div>
        );
        break;
      }
      default:
        input = (
          <Input
            value={promptResult ?? ""}
            disabled={locked}
            onChange={(e) => setPromptResult(e.target.value)}
            size="medium"
            color="primary"
          />
        );
    }
    valueEditorContent = (
      <div>
        {valueEditor.label && (
          <h4>
            {valueEditor.label}
            {locked && (
              <>
                {" "}
                <Icon icon="lock" size="font" />
              </>
            )}
          </h4>
        )}
        {input}
      </div>
    );
  }

  const applyDisabled = valueEditor
    ? promptResult === null
    : !editor?.code?.length;

  return (
    <BaseModal
      title={
        titleString ?? (titleKey ? t(titleKey) : t("modals.entityCode.title"))
      }
      size={modalSize}
      opening={opening}
      closing={closing}
    >
      <div className="entity-code-modal-layout" ref={containerRef}>
        <div
          className="entity-code-modal-preface"
          style={{ height: prefaceSize?.height }}
        >
          <div className="entity-code-modal-preface-inner" ref={prefaceRef}>
            {prefaceContent && (
              <div className="entity-code-modal-prompt">{prefaceContent}</div>
            )}
            {variablesContent && <div>{variablesContent}</div>}
          </div>
        </div>
        {editorId && sizeResolved && !valueEditorContent && (
          <div className="entity-code-modal-text-editor">
            <CodeEditorTextEditor editorId={editorId} readonly={immutable} />
          </div>
        )}
        {valueEditorContent && (
          <div className="operator-override">{valueEditorContent}</div>
        )}
        <div className="entity-code-modal-actions">
          {presetCode !== undefined && !immutable && !valueEditorContent && (
            <Button
              variant="outlined"
              color="primary"
              disabled={editor?.code === presetCode}
              onClick={onReset}
              sx={{ mr: 1 }}
            >
              Reset
            </Button>
          )}
          <Button
            variant="contained"
            color="primary"
            disabled={applyDisabled}
            onClick={onSubmit}
          >
            Apply
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}

export const EntityCodeModalDefinition: ModalDefinitionType<"entityCode"> = {
  modalName: "entityCode",
  component: EntityCodeModal
};
