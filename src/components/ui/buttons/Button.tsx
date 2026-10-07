import cx from "classnames";
import React, { CSSProperties, ReactElement, ReactNode, useState } from "react";
import { ArrowContainer, Popover } from "react-tiny-popover";

import "./Button.less";

export type ButtonProps = {
  className?: string;
  id?: string;
  "data-testid"?: string;
  children?: ReactNode;
  tooltip?: string | ReactElement;
  size?: "sm" | "md" | "lg" | number;
  square?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

export function Button(props: ButtonProps) {
  const {
    className: classNameIn,
    id,
    "data-testid": dataTestId,
    children,
    tooltip,
    size = "md",
    square,
    onClick
  } = props;
  const [mouseOver, setMouseOver] = useState(false);
  const className = cx("ui-button-d", classNameIn, {
    "button-square": !!square,
    [`button-size-${size}`]: typeof size === "string"
  });
  const cssProperties: CSSProperties = {};
  if (typeof size === "number") {
    cssProperties.width = size;
    cssProperties.height = size;
  }
  const content = (
    <div
      className={className}
      id={id}
      data-testid={dataTestId}
      style={cssProperties}
      onClick={onClick}
      onMouseEnter={() => setMouseOver(true)}
      onMouseLeave={() => setMouseOver(false)}
    >
      {children}
    </div>
  );
  if (tooltip !== undefined) {
    return (
      <Popover
        isOpen={mouseOver}
        padding={4}
        positions={["top", "bottom", "right", "left"]}
        content={(cProps) => (
          <ArrowContainer
            childRect={cProps.childRect}
            popoverRect={cProps.popoverRect}
            position={cProps.position}
            arrowSize={4}
            arrowColor="#000000"
          >
            <div className="button-tooltip">{tooltip}</div>
          </ArrowContainer>
        )}
      >
        {content}
      </Popover>
    );
  }
  return content;
}
