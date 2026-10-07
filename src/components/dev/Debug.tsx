import { ReactElement, useState } from "react";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { ItemList } from "src/components/dev/ItemList";
import { KillPlayerButton } from "src/components/dev/KillPlayerButton";
import { UIElementList } from "src/components/dev/UIElementList";

import { Icon } from "../ui/icons/Icon";
import { BuiltInScriptList } from "./BuiltInScriptList";
import "./Debug.less";
import { LoadButton, SaveButton } from "./LoadSaveButtons";

export function DebugTab() {
  return (
    <div className="debug-container">
      <div className="debug-scroll-area">
        <div className="grid-layout">
          <DebugSectionButton
            icon={<Icon icon="settings" className="dbg-icon" />}
            name="UI Elements"
          >
            <UIElementList />
          </DebugSectionButton>
          <DebugSectionButton
            icon={<Icon icon="inventory" className="dbg-icon" />}
            name="Items"
          >
            <ItemList />
          </DebugSectionButton>
          <DebugSectionButton
            icon={<Icon icon="tome" className="dbg-icon" />}
            name="Spell Presets"
          >
            <BuiltInScriptList />
          </DebugSectionButton>
          <DebugSectionButton
            icon={<Icon icon="player" className="dbg-icon" />}
            name="Player Actions"
          >
            <div className="debug-player-actions">
              <KillPlayerButton />
              <LoadButton />
              <SaveButton />
            </div>
          </DebugSectionButton>
        </div>
      </div>
    </div>
  );
}

export type DebugSectionButtonProps = {
  name: string;
  icon: ReactElement;
  children: ReactElement;
};

export function DebugSectionButton({
  name,
  icon,
  children
}: DebugSectionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover
      isOpen={isOpen}
      padding={8}
      positions={["top", "left", "right", "bottom"]}
      align="center"
      onClickOutside={() => setIsOpen(false)}
      content={(pProps) => (
        <ArrowContainer
          childRect={pProps.childRect}
          position={pProps.position}
          popoverRect={pProps.popoverRect}
          arrowSize={8}
          arrowColor="#000"
        >
          <div className="debug-section-button-content">{children}</div>
        </ArrowContainer>
      )}
    >
      <div
        className="debug-section-button"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="button-icon">{icon}</div>
        <div className="button-label">{name}</div>
      </div>
    </Popover>
  );
}
