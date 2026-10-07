import cx from "classnames";
import { useMemo, useState } from "react";
import { ChromePicker } from "react-color";
import { ArrowContainer, Popover } from "react-tiny-popover";
import { Color } from "three";

import { Icon } from "../icons/Icon";
import "./ColorPalette.less";

export type ColorPaletteProps = {
  colors: number[];
  includePicker?: boolean;
  selected?: number;
  onChange?: (color: number) => void;
};

export function ColorPalette(props: ColorPaletteProps) {
  const { colors, includePicker, selected, onChange } = props;

  const selectedHex = useMemo(
    () => `#${new Color(selected).getHexString()}`,
    [selected]
  );
  const selectedColorIsLight = useMemo(() => {
    const hsl = {
      h: 0,
      s: 0,
      l: 0
    };
    return new Color(selected).getHSL(hsl).l > 0.5;
  }, [selected]);

  const [customColorOpen, setCustomColorOpen] = useState(false);

  return (
    <div className="color-palette">
      {colors.map((c, i) => (
        <div
          key={i}
          className={cx("color-square", selected && "selected")}
          style={{ background: `#${new Color(c).getHexString()}` }}
          onClick={() => onChange?.(c)}
        />
      ))}
      {includePicker && (
        <Popover
          isOpen={customColorOpen}
          onClickOutside={() => setCustomColorOpen(false)}
          positions={["top"]}
          padding={4}
          content={(cProps) => (
            <ArrowContainer
              childRect={cProps.childRect}
              popoverRect={cProps.popoverRect}
              position={cProps.position}
              arrowSize={4}
              arrowColor="#000000"
            >
              <div className="color-picker-popover">
                <ChromePicker
                  color={selectedHex}
                  disableAlpha
                  onChange={(result) => {
                    onChange?.(new Color(result.hex).getHex());
                  }}
                />
              </div>
            </ArrowContainer>
          )}
        >
          <div
            className={cx(
              "color-square custom-color",
              selectedColorIsLight && "is-light"
            )}
            style={{ background: selectedHex }}
            onClick={() => setCustomColorOpen((v) => !v)}
          >
            <Icon icon="arrowRight" size="font" />
          </div>
        </Popover>
      )}
    </div>
  );
}
