import { ReactNode } from "react";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { Button } from "src/components/ui/buttons/Button";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectEditorFontSize } from "src/redux/ui/selectors";
import { adjustEditorFontSize } from "src/redux/ui/slice";

import "./CodeEditorConfig.less";

export type CodeEditorConfigProps = {
  isOpen: boolean;
  children: ReactNode;
  close?: () => void;
};

export function CodeEditorConfig(props: CodeEditorConfigProps) {
  const { isOpen, close, children } = props;
  const dispatch = useAppDispatch();
  const fontSize = useAppSelector(selectEditorFontSize);
  return (
    <Popover
      isOpen={isOpen}
      padding={5}
      positions={["bottom", "top"]}
      onClickOutside={close}
      content={(cProps) => (
        <ArrowContainer
          childRect={cProps.childRect}
          popoverRect={cProps.popoverRect}
          position={cProps.position}
          arrowSize={8}
          arrowColor="#000000"
        >
          <div className="code-editor-options-menu">
            <div className="code-editor-font-size-options">
              <Button
                square
                tooltip="Decrease Font Size"
                onClick={() => {
                  dispatch(adjustEditorFontSize(Math.max(10, fontSize - 1)));
                }}
              >
                -
              </Button>
              <Button
                square
                tooltip="Increase Font Size"
                onClick={() => {
                  dispatch(adjustEditorFontSize(Math.min(100, fontSize + 1)));
                }}
              >
                +
              </Button>
            </div>
          </div>
        </ArrowContainer>
      )}
    >
      <div className="code-editor-options-base-container">{children}</div>
    </Popover>
  );
}
