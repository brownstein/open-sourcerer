import { useCallback } from "react";
import { Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import { Conversation } from "src/api/conversation";
import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition
} from "src/api/overlay";
import { createTypedEventEmitter, typedEmitterPromise } from "src/api/util";
import { ConversationOverlay } from "src/components/viewport/overlays/Conversation";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import keyboardKeysJson from "./sprites/keyboard-keys.json";
import keyboardKeysPng from "./sprites/keyboard-keys.png";

export type OverlayConversationProps = EntityProps & {
  conversation?: Conversation<string, string>;
};

@addResourceLoader(
  new TextureResourceLoader("keyboardTexture", keyboardKeysPng)
)
export class OverlayConversation extends CoreEntity implements BaseEntityType {
  static type = "OverlayConversation";
  public type = "OverlayConversation";

  public conversationEvents = createTypedEventEmitter<{
    complete: string;
  }>();
  public conversation?: Conversation<string, string>;
  public keyboardTextureSprite = new ThreeAseprite({
    sourceJSON: keyboardKeysJson,
    texture: getResource<Texture>(OverlayConversation, "keyboardTexture")
  });
  public keyboardRenderEmitter = createTypedEventEmitter<{ render: void }>();

  private overlay?: OverlayAPI<OverlayConversationOverlayProps["overlayProps"]>;

  constructor(props: OverlayConversationProps) {
    super(props);

    if (props.conversation) this.setConversation(props.conversation);

    this.keyboardTextureSprite.gotoTag("E");
  }

  step(ms: number) {
    super.step(ms);

    if (!this.overlay && this.conversation) {
      this.overlay = this.level?.ctx?.overlayProvider?.addOverlay<
        OverlayConversationOverlayProps["overlayProps"]
      >({
        component: OverlayConversationOverlay,
        position: OverlayPosition.Viewport,
        overlayProps: {
          conversation: this
        }
      });
    }

    // Animate the key press sprite and provide render events for the DOM-based
    // Object3D renderer component to use.
    const prevFrame = this.keyboardTextureSprite.getCurrentFrame();
    this.keyboardTextureSprite.animate(ms * 0.25);
    if (prevFrame !== this.keyboardTextureSprite.getCurrentFrame()) {
      this.keyboardRenderEmitter.emit("render");
    }
  }

  async showConversation<
    Speakers extends string = string,
    Steps extends string = string
  >(conversation: Conversation<Speakers, Steps>): Promise<void> {
    this.setConversation(conversation);

    await typedEmitterPromise(this.conversationEvents, "complete");

    return;
  }

  setConversation<
    Speakers extends string = string,
    Steps extends string = string
  >(conversation: Conversation<Speakers, Steps>) {
    this.endConversation();

    const onCompleteWrapped = (lastStep: string) => {
      conversation.onComplete?.(lastStep as Steps);
      this.conversationEvents.emit("complete", lastStep);
    };

    this.conversation = {
      ...conversation,
      onComplete: onCompleteWrapped
    };
  }

  endConversation() {
    if (this.overlay) this.overlay.remove();

    this.overlay = undefined;
    this.conversation = undefined;
  }

  manualDetach() {
    if (this.level) this.level.removeEntity(this.id);
    this.destroy();
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    this.overlay?.remove();
    this.overlay = undefined;
  }
  destroy(): void {
    super.destroy();
    this.overlay?.remove();
    this.overlay = undefined;
    this.keyboardTextureSprite.dispose();
  }
}

type OverlayConversationOverlayProps = OverlayComponentProps<{
  conversation: OverlayConversation;
}>;

function OverlayConversationOverlay(props: OverlayConversationOverlayProps) {
  const { id: overlayId, api, overlayProps } = props;
  const { conversation } = overlayProps ?? {};

  const onComplete = useCallback(
    (currentStep: string) => {
      api.removeOverlay(overlayId);
      conversation?.conversation?.onComplete?.(currentStep);
    },
    [conversation, api, overlayId]
  );

  if (!conversation || !conversation.conversation) return null;
  return (
    <ConversationOverlay
      conversation={conversation.conversation}
      interactionObject3D={conversation.keyboardTextureSprite.mesh}
      interactionRefreshEmitter={conversation.keyboardRenderEmitter}
      onComplete={onComplete}
    />
  );
}
