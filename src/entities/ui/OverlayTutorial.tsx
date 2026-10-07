import cx from "classnames";

import { EntityProps, BaseEntityType, EntityLevelAPI } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition
} from "src/api/overlay";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { ConversationLine } from "src/components/viewport/overlays/Conversation";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import "./OverlayTutorial.css";

export type OverlayTutorialProps = EntityProps & {};

export class OverlayTutorial extends CoreEntity implements BaseEntityType {
  static type = "OverlayTutorial";
  public type = OverlayTutorial.type;

  private content: React.ReactNode;
  private overlay?: OverlayAPI<OverlayTutorialOverlayProps["overlayProps"]>;

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.overlay = level.ctx?.overlayProvider?.addOverlay({
      component: OverlayTutorialOverlay,
      overlayProps: {
        content: this.content
      },
      position: OverlayPosition.ViewportBottom
    });
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    this.overlay?.remove();
    this.overlay = undefined;
  }

  destroy() {
    super.destroy();
    this.overlay?.remove();
    this.overlay = undefined;
  }

  setContent(content: React.ReactNode) {
    if (!this.level) return;
    this.content = content;
    if (this.overlay) this.overlay.remove();
    this.overlay = this.level.ctx?.overlayProvider?.addOverlay({
      component: OverlayTutorialOverlay,
      overlayProps: {
        content: this.content
      },
      position: OverlayPosition.ViewportBottom
    });
  }

  hide() {
    this.overlay?.remove();
    this.overlay = undefined;
  }
}

export type OverlayTutorialOverlayProps = OverlayComponentProps<{
  content: React.ReactNode;
}>;

function OverlayTutorialOverlay(props: OverlayTutorialOverlayProps) {
  const { content } = props.overlayProps;

  return (
    <div className="overlay-tutorial-wrapper">
      <div className="overlay-tutorial-box">
        {content}
      </div>
    </div>
  );
}