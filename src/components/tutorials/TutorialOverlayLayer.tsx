import { Button } from "@mui/material";
import cx from "classnames";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { tutorialSingleton } from "src/components/tutorials/TutorialController";
import { TutorialControllerStepData } from "src/components/tutorials/TutorialControllerAPI";
import {
  Rect,
  useTargetPosition
} from "src/components/tutorials/useTargetPosition";

import "./TutorialOverlayLayer.css";

function padRect(rect: Rect | null, padding: number): Rect | null {
  if (rect === null) return null;
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

type HighlightElementProps = {
  rect: Rect;
  className?: string;
};

const HighlightElement = forwardRef<HTMLDivElement, HighlightElementProps>(
  function _HighlightElement(props, ref) {
    const { rect, className } = props;
    return (
      <div
        className={className}
        ref={ref}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height
        }}
      />
    );
  }
);

type ShadowBoxProps = {
  rect: Rect;
  className?: string;
};

function ShadowBox(props: ShadowBoxProps) {
  const { rect, className } = props;
  return (
    <div
      className={className}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height
      }}
    />
  );
}

export const tutorialTransitionMs = 500;

export function TutorialOverlayLayer() {
  const [currentStepData, setCurrentStepData] =
    useState<TutorialControllerStepData | null>(
      tutorialSingleton.getStepData()
    );
  const [stepsDisplayed, setStepsDisplayed] = useState<
    Map<number, TutorialControllerStepData>
  >(
    currentStepData
      ? new Map([[currentStepData.stepIndex, currentStepData]])
      : new Map()
  );

  useEffect(() => {
    const onStepUpdate = (stepData: TutorialControllerStepData) => {
      setCurrentStepData(stepData);
      setStepsDisplayed(
        (s) => new Map([...s.entries(), [stepData.stepIndex, stepData]])
      );
    };
    const onTutorialCompleted = () => {
      setCurrentStepData(null);
    };
    tutorialSingleton.events.on("tutorialStepStarted", onStepUpdate);
    tutorialSingleton.events.on("tutorialStepProgress", onStepUpdate);
    tutorialSingleton.events.on("tutorialExited", onTutorialCompleted);
    return () => {
      tutorialSingleton.events.off("tutorialStepStarted", onStepUpdate);
      tutorialSingleton.events.off("tutorialStepProgress", onStepUpdate);
      tutorialSingleton.events.off("tutorialExited", onTutorialCompleted);
    };
  }, []);

  useEffect(() => {
    const removeExtraSteps = () => {
      if (currentStepData) {
        setStepsDisplayed(
          new Map([[currentStepData.stepIndex, currentStepData]])
        );
      } else {
        setStepsDisplayed(new Map());
      }
    };
    const timeout = setTimeout(removeExtraSteps, tutorialTransitionMs);
    return () => clearTimeout(timeout);
  }, [currentStepData]);

  const tutorialStepTarget = currentStepData?.step.pointTo ?? null;
  const rawRect = useTargetPosition(tutorialStepTarget);
  const rect = useMemo(
    () => padRect(rawRect, currentStepData?.step.highlightPadding ?? 4),
    [rawRect]
  );

  return (
    <>
      {!!currentStepData?.step.shadowBox && rect && (
        <ShadowBox rect={rect} className="tutorial-overlay-shadow-box" />
      )}
      {[...stepsDisplayed.values()].map((v) => (
        <TutorialStepRenderer
          key={v.stepIndex}
          stepData={v}
          goingAway={v.stepIndex !== currentStepData?.stepIndex}
        />
      ))}
    </>
  );
}

export type TutorialStepProps = {
  stepData: TutorialControllerStepData;
  goingAway?: boolean;
};

export function TutorialStepRenderer(props: TutorialStepProps) {
  const { stepData, goingAway } = props;
  const { t } = useTranslation();

  const tutorialStepTarget = stepData.step.pointTo ?? null;
  const rawRect = useTargetPosition(tutorialStepTarget);
  const rect = useMemo(
    () => padRect(rawRect, stepData.step.highlightPadding ?? 4),
    [rawRect]
  );

  const cxModifier = { disappearing: goingAway };
  const content = (
    <TutorialOverlayContent stepData={stepData} goingAway={goingAway} />
  );

  if (rect === null) {
    return (
      <div className={cx("tutorial-overlay-centered", cxModifier)}>
        {content}
      </div>
    );
  }

  return (
    <Popover
      isOpen
      padding={4}
      positions={["right", "bottom", "left", "top"]}
      align="center"
      content={(pProps) => (
        <ArrowContainer
          childRect={pProps.childRect}
          position={pProps.position}
          popoverRect={pProps.popoverRect}
          arrowSize={8}
          arrowColor="#4e0708"
          arrowClassName={cx("tutorial-overlay-popover-arrow", cxModifier)}
        >
          {content}
        </ArrowContainer>
      )}
    >
      <HighlightElement
        rect={rect}
        className={cx("tutorial-overlay-highlight", {
          disappearing: goingAway
        })}
      />
    </Popover>
  );
}

type TutorialOverlayContentProps = {
  stepData: TutorialControllerStepData;
  goingAway?: boolean;
};

function TutorialOverlayContent(props: TutorialOverlayContentProps) {
  const { stepData, goingAway } = props;
  const { t } = useTranslation();

  const cxModifier = { disappearing: goingAway };
  const canAdvance =
    !goingAway &&
    ((!stepData.step.isDone && !stepData.step.isDoneFraction) ||
      stepData.step.enableSkip);

  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty(
      "--tutorial-completion-ratio",
      String(stepData.stepProgressFraction ?? 0)
    );
  }, [stepData]);

  return (
    <div
      className={cx("tutorial-overlay-content", cxModifier)}
      ref={containerRef}
    >
      <div className="tutorial-overlay-content-inner">
        {stepData.step.content(t)}
      </div>
      {canAdvance && (
        <div className="tutorial-overlay-content-actions">
          <Button
            variant="contained"
            size="medium"
            onClick={() => tutorialSingleton.advanceForward()}
          >
            Next
          </Button>
        </div>
      )}
      {stepData.stepProgressFraction !== undefined && (
        <div className="tutorial-step-progress" />
      )}
    </div>
  );
}
