import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import wait from "wait";

import { EntityLevelAPI } from "src/api/entity";
import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayPosition
} from "src/api/overlay";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import "./IntroSeqTitleOverlay.css";

type IntroSeqTitleEventTypes = {
  switchToGnarledHelix: number;
  switchToGameLogo: number;
  disappear: number;
  componentReady: void;
};

type IntroSeqTitleOverlayComponentOverlayProps = {
  transitionEvents: TypedEventEmitter<IntroSeqTitleEventTypes>;
};

type IntroSeqTitleOverlayComponentProps =
  OverlayComponentProps<IntroSeqTitleOverlayComponentOverlayProps>;

function IntroSeqTitleOverlayComponent(
  props: IntroSeqTitleOverlayComponentProps
) {
  const { overlayProps } = props;
  const { transitionEvents } = overlayProps;

  const wrapperRef = useRef<HTMLDivElement>(null);

  const [displayState, setDisplayState] = useState<
    "gnarledHelixLogo" | "gameLogo" | null
  >(null);
  const [logoAppearing, setLogoAppearing] = useState(false);
  const [logoDisappearing, setLogoDisappearing] = useState(false);
  const [appearing, setAppearing] = useState(true);
  const [disappearing, setDisappearing] = useState(false);

  const mutableRef = useRef({
    displayState,
    logoAppearing,
    logoDisappearing,
    appearing,
    disappearing
  });
  mutableRef.current.displayState = displayState;
  mutableRef.current.logoAppearing = logoAppearing;
  mutableRef.current.logoDisappearing = logoDisappearing;
  mutableRef.current.appearing = appearing;
  mutableRef.current.disappearing = disappearing;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const mutableState = mutableRef.current;

    if (!wrapper) return;

    const setDuration = (ms: number) => {
      wrapper.style.setProperty("--intro-title-transition-duration", `${ms}ms`);
    };

    const transitionToGnarledHelix = async (ms: number) => {
      setAppearing(true);
      setDisappearing(false);
      if (mutableState.logoAppearing) {
        setDuration(ms * 0.5);
        setLogoAppearing(false);
        setLogoDisappearing(true);
        await wait(ms * 0.5);
      } else {
        setDuration(ms);
      }
      setDisplayState("gnarledHelixLogo");
      setLogoAppearing(true);
      setLogoDisappearing(false);
    };
    const transitionToGameLogo = async (ms: number) => {
      setAppearing(true);
      setDisappearing(false);
      if (mutableState.logoAppearing) {
        setDuration(ms * 0.5);
        setLogoAppearing(false);
        setLogoDisappearing(true);
        await wait(ms * 0.5);
      } else {
        setDuration(ms);
      }
      setDisplayState("gameLogo");
      setLogoAppearing(true);
      setLogoDisappearing(false);
    };
    const disappear = async (ms: number) => {
      setDuration(ms);
      setAppearing(false);
      setDisappearing(true);
      setLogoAppearing(false);
      setLogoDisappearing(true);
    };

    transitionEvents.on("switchToGnarledHelix", transitionToGnarledHelix);
    transitionEvents.on("switchToGameLogo", transitionToGameLogo);
    transitionEvents.on("disappear", disappear);

    transitionEvents.emit("componentReady");

    return () => {
      transitionEvents.off("switchToGnarledHelix", transitionToGnarledHelix);
      transitionEvents.off("switchToGameLogo", transitionToGameLogo);
      transitionEvents.off("disappear", disappear);
    };
  }, [transitionEvents]);

  return (
    <div
      ref={wrapperRef}
      className={cx("intro-sequence-overlay", {
        appearing,
        disappearing,
        "logo-appearing": logoAppearing,
        "logo-disappearing": logoDisappearing
      })}
    >
      {displayState === "gnarledHelixLogo" && (
        <div className="logo-and-title">
          <div className="gnarled-helix-logo" />
          <h1>Gnarled Helix LLC</h1>
        </div>
      )}
      {displayState === "gameLogo" && (
        <div className="logo-and-title">
          <div className="game-logo" />
        </div>
      )}
    </div>
  );
}

export class IntroSeqTitleOverlay extends CoreEntity {
  static type = "IntroSeqTitleOverlay";
  public type = IntroSeqTitleOverlay.type;

  public overlayEvents = createTypedEventEmitter<IntroSeqTitleEventTypes>();
  private overlay?: OverlayAPI<IntroSeqTitleOverlayComponentOverlayProps>;

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.overlay =
      level.ctx?.overlayProvider?.addOverlay<IntroSeqTitleOverlayComponentOverlayProps>(
        {
          component: IntroSeqTitleOverlayComponent,
          position: OverlayPosition.Viewport,
          overlayProps: {
            transitionEvents: this.overlayEvents
          }
        }
      );
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
}
