import { useMemo, useState } from "react";
import { AlphaPicker, CompactPicker, RGBColor } from "react-color";
import { ArrowContainer, Popover, PopoverPosition } from "react-tiny-popover";
import { Color } from "three";

import "./ColorPicker.less";

export type ColorPickerProps = {
  value: string;
  alpha?: number;
  onChange?: (color: string) => void;
  onChangeAlpha?: (alpha: number) => void;
  showAlpha?: boolean;
  positions?: PopoverPosition | PopoverPosition[];
};

export function ColorPicker(props: ColorPickerProps) {
  const { value, alpha, onChange, onChangeAlpha, positions, showAlpha } = props;
  const [isOpen, setIsOpen] = useState(false);

  const colorWithAlpha = useMemo<RGBColor>(() => {
    const threeColor = new Color(value);
    return {
      r: threeColor.r * 255,
      g: threeColor.g * 255,
      b: threeColor.b * 255,
      a: alpha
    };
  }, [value, alpha]);

  return (
    <Popover
      isOpen={isOpen}
      onClickOutside={() => setIsOpen(false)}
      positions={positions}
      content={({ position, childRect, popoverRect }) => (
        <ArrowContainer
          position={position}
          childRect={childRect}
          popoverRect={popoverRect}
          arrowColor="#000000"
          arrowSize={8}
        >
          <div className="color-picker-popover">
            <CompactPicker color={value} onChange={(c) => onChange?.(c.hex)} />
            {showAlpha && (
              <AlphaPicker
                color={colorWithAlpha}
                className="alpha-picker"
                onChange={(c) => onChangeAlpha?.(c.rgb.a ?? 1)}
              />
            )}
          </div>
        </ArrowContainer>
      )}
    >
      <div
        className="color-field"
        style={{ backgroundColor: value ?? "#ffffff" }}
        onClick={() => setIsOpen(true)}
      />
    </Popover>
  );
}
