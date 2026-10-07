import cx from "classnames";
import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition
} from "src/api/overlay";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { AdanaDialogueWrapper } from "src/components/ui/dialogue/AdanaDialogueWrapper";
import { ConversationLine } from "src/components/viewport/overlays/Conversation";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import "./AdanaInitialDialog.less";

export type AdanaDialogueContent = (string | ReactElement)[][];

type AddanaDialogueUpdateEvents = {
  contentUpdate: AdanaDialogueContent;
};

type AdanaInitialDialogOverlayComponentProps = OverlayComponentProps<{
  content: AdanaDialogueContent;
  contentUpdateEmitter: TypedEventEmitter<AddanaDialogueUpdateEvents>;
  closeEmitter: DeferredEmitter;
}>;

function AdanaInitialDialogOverlayComponent(
  props: AdanaInitialDialogOverlayComponentProps
) {
  const { overlayProps } = props;
  const {
    closeEmitter,
    contentUpdateEmitter,
    content: initialContent
  } = overlayProps ?? {};
  const [isStarted, setIsStarted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [nextReady, setNextReady] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => setIsStarted(true), 1200);
    return () => {
      clearTimeout(startTimeout);
    };
  }, []);

  useEffect(() => {
    const onClose = () => setClosing(true);
    closeEmitter?.on("done", onClose);
    return () => {
      closeEmitter?.off("done", onClose);
    };
  }, [closeEmitter]);

  const [content, setContent] = useState(initialContent ?? []);
  const [contentPage, setContentPage] = useState(0);

  useEffect(() => {
    const onUpdate = (content: AdanaDialogueContent) => {
      setContentPage(0);
      setContent(content);
      setNextReady(false);
    };
    contentUpdateEmitter?.on("contentUpdate", onUpdate);
    return () => contentUpdateEmitter?.off("contentUpdate", onUpdate);
  }, [contentUpdateEmitter]);

  const convo = useMemo(() => content.at(contentPage), [content, contentPage]);

  const onTypingComplete = useCallback(() => {
    setNextReady(true);
  }, []);

  return (
    <div className={cx("adana-initial-dialog-overlay", closing && "closing")}>
      <div className="wrapper">
        <AdanaDialogueWrapper showNext={nextReady}>
          <div className="content">
            <ConversationLine
              line={convo}
              started={isStarted}
              onTypingComplete={onTypingComplete}
            />
          </div>
        </AdanaDialogueWrapper>
      </div>
    </div>
  );
}

export type AdanaInitialDialogProps = EntityProps & {};

export class AdanaInitialDialog extends CoreEntity {
  static type = "AdanaInitialDialog";
  public type = AdanaInitialDialog.type;

  private appeared = false;
  private overlay?: OverlayAPI<
    AdanaInitialDialogOverlayComponentProps["overlayProps"]
  >;
  private closeEmitter = new DeferredEmitter();
  private updateEmitter = createTypedEventEmitter<AddanaDialogueUpdateEvents>();
  private content: (string | ReactElement)[][] = [["Hello Adana"]];

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    this.overlay?.remove();
    this.overlay = undefined;
  }

  destroy(): void {
    super.destroy();
    this.overlay?.remove();
    this.overlay = undefined;
  }

  setContent(content: AdanaDialogueContent) {
    this.content = content;
    this.updateEmitter.emit("contentUpdate", content);
  }

  appear() {
    if (this.appeared) return;
    this.closeEmitter.clearState();
    this.appeared = true;
    this.overlay = this.level?.ctx?.overlayProvider?.addOverlay({
      component: AdanaInitialDialogOverlayComponent,
      position: OverlayPosition.ViewportBottom,
      overlayProps: {
        content: this.content,
        contentUpdateEmitter: this.updateEmitter,
        closeEmitter: this.closeEmitter
      }
    });
  }

  disappear(duration = 1500) {
    this.closeEmitter.emit("done");
    this.scheduler.add({
      duration,
      invokeFunctionAtComplete: () => {
        this.overlay?.remove();
        this.overlay = undefined;
        this.appeared = false;
      }
    });
  }

  scheduleDisappear(waitTime: number): void {
    this.scheduler.add({
      duration: waitTime,
      invokeFunctionAtComplete: () => this.disappear()
    });
  }

  appearForScheduledTime(visibleTime: number): void {
    this.appear();
    this.scheduleDisappear(visibleTime);
  }

  async performDialogSequence(
    ...dialogSequence: { content: AdanaDialogueContent; visibleTime: number }[]
  ): Promise<void> {
    for (const dialog of dialogSequence) {
      this.setContent(dialog.content);
      this.appear();

      await this.scheduler.asyncTimeout(dialog.visibleTime);
    }

    this.disappear();
    return;
  }
}
