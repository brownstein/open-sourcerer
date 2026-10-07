import cx from "classnames";
import {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Box2, Object3D, Vector2, Vector3 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { ControlEvents } from "src/api/controls";
import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition,
  OverlayProviderEvents
} from "src/api/overlay";
import { SoundType } from "src/api/sound";
import { createTypedEventEmitter } from "src/api/util";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { Object3DRenderer } from "src/components/ui/item/ItemRenderer";
import {
  UseTypingEvents,
  useTypingText
} from "src/components/util/useTypingText";
import { GameControllerEvents } from "src/engine/controller/GameControllerAPI";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addResourceLoader,
  getAsset,
  getResource,
  setAssetDependencies
} from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { Sound } from "src/engine/sound/Sound";
import { vector3To2 } from "src/engine/util/vecTypes";

import { isPlayerAPI } from "../player/PlayerAPI";
import { ControlEventsProxy } from "../shared/behaviors/ControlEventsProxy";
import "./PopoverConversation.less";
import keyboardKeysJson from "./sprites/keyboard-keys.json";
import keyboardKeysPng from "./sprites/keyboard-keys.png";

export type ConversationStep = {
  participantId: string;
  // TODO: localize dialog.
  line: string;
  onComplete?: () => void;
};

export type PopoverConversationProps = EntityProps & {
  participants: BaseEntityType[];
  lines: ConversationStep[];
  onComplete?: () => void;
};
@addResourceLoader(
  new TextureResourceLoader("keyboardTexture", keyboardKeysPng)
)
@setAssetDependencies(() => [
  "chatter1Sound",
  "chatter2Sound",
  "chatter3Sound",
  "chatter4Sound",
  "chatter5Sound",
  "chatter6Sound"
])
export class PopoverConversation extends CoreEntity implements BaseEntityType {
  static type = "PopoverConversation";
  public type = "PopoverConversation";
  public behaviors = {
    controlsProxy: new ControlEventsProxy().listenToPlayerControls()
  };
  public object3D = new Object3D();
  public persist = false;
  public participants: BaseEntityType[];
  public lines: ConversationStep[];
  public currentLineIndex = 0;
  public conversationEvents = createTypedEventEmitter<{
    advance: void;
    goAway: void;
    spriteRefresh: void;
    complete: void;
  }>();
  public interactionSprite: ThreeAseprite;
  private participantIdToEntity = new Map<string, BaseEntityType>();
  private overlay?: OverlayAPI<PopoverConversationOverlayProps["overlayProps"]>;
  private goingAway = false;
  private onComplete?: () => void;
  constructor(props: PopoverConversationProps) {
    super(props);
    this.participants = props.participants;
    this.lines = props.lines;
    this.onComplete = props.onComplete;
    for (const participant of this.participants) {
      this.participantIdToEntity.set(participant.id, participant);
    }
    this.interactionSprite = new ThreeAseprite({
      texture: getResource(PopoverConversation, "keyboardTexture"),
      sourceJSON: keyboardKeysJson
    });
    this.interactionSprite.gotoTag("E");
    this.behaviors.controlsProxy.on(ControlEvents.Interact, () => {
      this.advanceLine();
    });
  }
  step(ms: number) {
    super.step(ms);
    if (!this.overlay) {
      const player = [...(this.level?.getEntities().values() ?? [])].find(
        isPlayerAPI
      );
      if (!player) return;
      const participants = new Map<string, BaseEntityType>();
      for (const participant of this.participants) {
        participants.set(participant.id, participant);
      }
      this.overlay = this.level?.ctx?.overlayProvider?.addOverlay<
        PopoverConversationOverlayProps["overlayProps"]
      >({
        component: PopoverConversationOverlay,
        position: OverlayPosition.Viewport,
        overlayProps: {
          conversation: this
        }
      });
    }
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.scheduler.add({
      id: "toggleInteractionKey",
      duration: 500,
      recurring: true,
      invokeFunctionAtComplete: () => {
        this.interactionSprite.gotoTagFrame(
          ((this.interactionSprite.getCurrentTagFrame() ?? 0) + 1) % 2
        );
        this.conversationEvents.emit("spriteRefresh");
      }
    });
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
    this.interactionSprite.dispose();
  }
  gracefullyExit() {
    this.goingAway = true;
    this.conversationEvents.emit("goAway");
    this.scheduler.add({
      duration: 500,
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(this.id);
      }
    });
  }
  getConversationBottomCenterPosition() {
    const avgPosition = new Vector3();
    for (const participant of this.participantIdToEntity.values()) {
      avgPosition.add(participant.position);
    }
    avgPosition.multiplyScalar(1 / this.participantIdToEntity.size);
    let topY = avgPosition.y;
    for (const participant of this.participantIdToEntity.values()) {
      const participantTopY =
        participant.position.y + participant.size.height * 0.5;
      topY = Math.max(participantTopY, topY);
    }
    avgPosition.y = topY;
    return avgPosition;
  }
  getParticipantAnchorPosition(id: string) {
    const entity = this.participantIdToEntity.get(id);
    if (!entity) return null;
    const anchor = entity.position.clone();
    anchor.y += entity.size.height * 0.5;
    return anchor;
  }
  getColorForParticipantId(id: string) {
    const entity = this.participantIdToEntity.get(id);
    if (!entity) return null;
    return isPlayerAPI(entity) ? "#28f" : "#2c2";
  }
  getIsRightAlignedForParticipantId(id: string) {
    const entity = this.participantIdToEntity.get(id);
    if (!entity) return false;
    const centerPos = this.getConversationBottomCenterPosition();
    return entity.position.x > (centerPos?.x ?? 0);
  }
  getLinesUpToCurrentProgress() {
    return this.lines.slice(0, this.currentLineIndex + 1);
  }
  advanceLine() {
    if (this.goingAway) return;
    this.lines.at(this.currentLineIndex)?.onComplete?.();
    if (this.currentLineIndex < this.lines.length - 1) {
      this.currentLineIndex++;
      this.conversationEvents.emit("advance");
    } else {
      this.onComplete?.();
      this.gracefullyExit();
      this.conversationEvents.emit("complete");
    }
  }
}

export type PopoverConversationOverlayProps = OverlayComponentProps<{
  conversation: PopoverConversation;
}>;

export function PopoverConversationOverlay(
  props: PopoverConversationOverlayProps
) {
  const { id: overlayId, api, overlayProps, screenSize } = props;
  const { conversation } = overlayProps ?? {};

  const controller = useContext(GameControllerContext);

  const [bottomCenterPosition, setBottomCenterPosition] =
    useState<Vector2 | null>(null);
  const iState = useRef({
    bottomCenterPosition,
    screenSize
  });
  iState.current.bottomCenterPosition = bottomCenterPosition;
  iState.current.screenSize = screenSize;

  const posToScreen = useCallback(
    (pos: Vector3) => {
      const iStateCurrent = iState.current;
      const { screenSize } = iStateCurrent;
      const camera = controller?.level?.cameraDirector?.getViewportCamera();
      if (!camera) return new Vector2();
      const screenPos3 = pos.clone().project(camera);
      const screenPos2 = vector3To2(screenPos3);
      screenPos2
        .add(new Vector2(1, 1))
        .multiply(screenSize)
        .multiplyScalar(0.5);
      screenPos2.y = screenSize.y - screenPos2.y;
      screenPos2.round();
      return screenPos2;
    },
    [controller]
  );

  useEffect(() => {
    if (!conversation || !controller) return;
    const iStateCurrent = iState.current;
    const doUpdate = () => {
      const bottomCenterPosition3 =
        conversation.getConversationBottomCenterPosition();
      const bottomCenterPosition = posToScreen(bottomCenterPosition3);
      bottomCenterPosition.y -= 16;
      if (iStateCurrent.bottomCenterPosition?.equals(bottomCenterPosition))
        return;
      setBottomCenterPosition(bottomCenterPosition);
    };
    api.events.on(OverlayProviderEvents.RenderFrame, doUpdate);
    return () => {
      api.events.off(OverlayProviderEvents.RenderFrame, doUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, posToScreen]);

  const [convoElements, setConvoElements] = useState<ReactNode[] | null>(null);

  useEffect(() => {
    const updateConvoElements = () => {
      if (!conversation) return;
      setConvoElements(
        conversation
          .getLinesUpToCurrentProgress()
          .map((l, i) => (
            <PopoverConversationStep
              key={i}
              conversation={conversation}
              conversationStep={l}
              sceneToScreenPosition={posToScreen}
              showTail={i > conversation.currentLineIndex - 2}
              isLastStep={i === conversation.currentLineIndex}
            />
          )) ?? null
      );
    };
    const goAway = () => {
      setTimeout(() => {
        api.removeOverlay(overlayId);
      }, 500);
    };
    conversation?.conversationEvents.on("advance", updateConvoElements);
    conversation?.conversationEvents.on("goAway", goAway);
    updateConvoElements();
    return () => {
      conversation?.conversationEvents.off("advance", updateConvoElements);
      conversation?.conversationEvents.off("goAway", goAway);
    };
  }, [api, overlayId, conversation, posToScreen]);

  return (
    <div
      className="popover-conversation"
      style={{
        bottom: screenSize.y - (bottomCenterPosition?.y ?? 0),
        left: bottomCenterPosition?.x
      }}
    >
      {convoElements}
    </div>
  );
}

export type PopoverConversationStepProps = {
  sceneToScreenPosition: (scenePos: Vector3) => Vector2;
  conversation: PopoverConversation;
  conversationStep: ConversationStep;
  showTail?: boolean;
  isLastStep?: boolean;
};

export function PopoverConversationStep(props: PopoverConversationStepProps) {
  const {
    sceneToScreenPosition,
    conversation,
    conversationStep,
    showTail,
    isLastStep
  } = props;
  const controller = useContext(GameControllerContext);

  const color = useMemo(
    () =>
      conversation.getColorForParticipantId(conversationStep.participantId) ??
      undefined,
    [conversation, conversationStep]
  );
  const [fadingOut, setFadingOut] = useState(false);

  const [rightAligned, setRightAligned] = useState(
    conversation.getIsRightAlignedForParticipantId(
      conversationStep.participantId
    ) ?? false
  );
  const [tail, setTail] = useState<React.ReactNode | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const goAway = () => setFadingOut(true);
    conversation.conversationEvents.on("goAway", goAway);
    return () => {
      conversation.conversationEvents.off("goAway", goAway);
    };
  }, [conversation]);

  useEffect(() => {
    const layoutTail = () => {
      const rightAligned =
        conversation.getIsRightAlignedForParticipantId(
          conversationStep.participantId
        ) ?? false;
      setRightAligned(rightAligned);

      if (!showTail) {
        setTail(null);
        return;
      }

      let overlayRendererEl: HTMLElement | undefined;
      let currentEl = containerRef.current?.parentElement;
      while (currentEl) {
        if (currentEl.classList.contains("overlay-renderer")) {
          overlayRendererEl = currentEl;
          break;
        }
        currentEl = currentEl.parentElement;
      }

      const containerRect = containerRef.current?.getBoundingClientRect();
      const overlayRendererRect = overlayRendererEl?.getBoundingClientRect();
      const targetPos3 = conversation.getParticipantAnchorPosition(
        conversationStep.participantId
      );

      if (!targetPos3 || !containerRect || !overlayRendererRect) return;

      const arrowEndPos = sceneToScreenPosition(targetPos3);
      const arrowStartPos = new Vector2(
        containerRect.left +
          containerRect.width * 0.5 -
          overlayRendererRect.left,
        containerRect.top + containerRect.height - overlayRendererRect.top
      );

      if (rightAligned) {
        arrowStartPos.x += containerRect.width * 0.5 - 24;
      } else {
        arrowStartPos.x -= containerRect.width * 0.5 - 24;
      }

      arrowStartPos.x -= containerRect.x - overlayRendererRect.x;
      arrowStartPos.y -= containerRect.y - overlayRendererRect.y;
      arrowStartPos.y -= 2;

      arrowEndPos.x -= containerRect.x - overlayRendererRect.x;
      arrowEndPos.y -= containerRect.y - overlayRendererRect.y;

      const arrowWidth = 6;
      const arrowCurve = 32;

      const arrowMidPos = arrowStartPos.clone().lerp(arrowEndPos, 0.5);
      if (rightAligned) {
        arrowMidPos.x += arrowCurve;
      } else {
        arrowMidPos.x -= arrowCurve;
      }

      arrowEndPos.lerp(arrowMidPos, 0.5);

      arrowStartPos.round();
      arrowMidPos.round();
      arrowEndPos.round();

      const arrowBoundsRaw = new Box2();
      arrowBoundsRaw.expandByPoint(arrowStartPos);
      arrowBoundsRaw.expandByPoint(arrowMidPos);
      arrowBoundsRaw.expandByPoint(arrowEndPos);
      arrowBoundsRaw.min.x -= Math.max(arrowWidth, arrowCurve);
      arrowBoundsRaw.max.x += Math.max(arrowWidth, arrowCurve);
      const arrowBoundsSize = new Vector2();
      arrowBoundsRaw.getSize(arrowBoundsSize);
      const svgPath = [
        `M ${arrowStartPos.x + arrowWidth} ${arrowStartPos.y}`,
        `Q ${arrowMidPos.x + arrowWidth * 0.5} ${arrowMidPos.y} ${arrowEndPos.x} ${arrowEndPos.y}`,
        `Q ${arrowMidPos.x - arrowWidth * 0.5} ${arrowMidPos.y} ${arrowStartPos.x - arrowWidth} ${arrowStartPos.y}`
      ].join(" ");
      setTail(
        <svg
          style={{
            position: "absolute",
            left: arrowBoundsRaw.min.x,
            top: arrowBoundsRaw.min.y,
            width: arrowBoundsSize.x,
            height: arrowBoundsSize.y
          }}
          width={arrowBoundsSize.x}
          height={arrowBoundsSize.y}
          viewBox={`${arrowBoundsRaw.min.x} ${arrowBoundsRaw.min.y} ${arrowBoundsSize.x} ${arrowBoundsSize.y}`}
        >
          <path
            style={{
              stroke: color,
              strokeWidth: 1,
              fill: "#fff",
              transition: "d 100ms ease"
            }}
            d={svgPath}
          />
        </svg>
      );
    };

    // Update the component once every 100ms, driven by the main update loop.
    let msElapsed = 0;
    const onFrame = (ms: number) => {
      msElapsed += ms;
      if (msElapsed >= 100) {
        msElapsed = 0;
        layoutTail();
      }
    };

    controller?.events.on(GameControllerEvents.RenderFrame, onFrame);
    return () => {
      controller?.events.off(GameControllerEvents.RenderFrame, onFrame);
    };
  }, [
    controller,
    conversation,
    conversationStep,
    showTail,
    color,
    sceneToScreenPosition
  ]);

  const [textLine, typingDone, typingEmitter] = useTypingText({
    text: conversationStep.line
  });

  useEffect(() => {
    typingEmitter.on(UseTypingEvents.WordStarted, () => {
      const wordSoundBuff = getAsset<AudioBuffer>(
        `chatter${Math.floor(Math.random() * 6) + 1}Sound`
      );
      const wordSound = new Sound(SoundType.SFX, wordSoundBuff);
      wordSound.play();
    });
  }, [typingEmitter]);

  const renderEmitter = useMemo(
    () => createTypedEventEmitter<{ render: void }>(),
    []
  );

  useEffect(() => {
    if (!isLastStep) return;
    const refresh = () => renderEmitter.emit("render");
    conversation.conversationEvents.on("spriteRefresh", refresh);
    return () => {
      conversation.conversationEvents.off("spriteRefresh", refresh);
    };
  }, [isLastStep, conversation, renderEmitter]);

  const keyPrompt =
    typingDone && isLastStep ? (
      <Object3DRenderer
        object3D={conversation.interactionSprite.mesh}
        className="continue-interact-prompt"
        renderEmitter={renderEmitter}
      />
    ) : null;

  return (
    <div
      ref={containerRef}
      className={cx("popover-conversation-step", {
        "right-aligned": rightAligned,
        "fading-out": fadingOut
      })}
      style={{
        color,
        borderColor: color
      }}
    >
      {textLine}
      {tail}
      {keyPrompt}
    </div>
  );
}
