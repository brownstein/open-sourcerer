import { isValidElement, ReactElement, ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import { CodingChallengeContentContext } from "./context";
import { CodeEditorLocalTextEditor } from "src/components/editor/CodeEditorLocalTextEditor";

export type InlineEditorProps = {
  id: string;
  children: ReactElement | ReactElement[];
};

export function InlineEditor(props: InlineEditorProps) {
  const { id, children } = props;
  const ccContext = useContext(CodingChallengeContentContext);
  const { onChangeCode } = ccContext ?? {};

  // Get the tokenized code contained contained in all child elements.
  // This only works because we're using plain elements internally - don't try
  // wrapping complex components insdie this component.
  const textContent = useMemo(() => {
    let textContents: string[] = [];
    const _traverse = (node: ReactNode) => {
      if (node === null || node === undefined) return;
      switch (typeof node) {
        case "string":
          textContents.push(node);
          return;
        case "boolean":
        case "number":
          textContents.push(String(node));
          return;
        default:
          break;
      }
      if (Array.isArray(node)) {
        node.map(_traverse);
        return;
      }
      if (!isValidElement(node)) return;
      const withChildren = node as ReactElement<{ children?: React.ReactNode }>;
      if (withChildren.props.children !== undefined)
        _traverse(withChildren.props.children);
    };
    _traverse(children);
    return textContents.join("");
  }, [children]);
  
  const callbacksRef = useRef({ onChangeCode });
  callbacksRef.current.onChangeCode = onChangeCode;

  const onChange = useCallback((code: string) => {
    callbacksRef.current.onChangeCode?.(id, code);
  }, [id]);

  return (
    <CodeEditorLocalTextEditor
      value={textContent}
      onChange={onChange}
    />
  );
}
