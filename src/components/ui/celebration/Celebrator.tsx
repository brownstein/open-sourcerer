import confetti from "canvas-confetti";
import { useEffect, useState } from "react";
import wait from "wait";

import { Celebration } from "src/api/celebration";

import { Icon, IconName, isSupportedIcon } from "../icons/Icon";
import { celebrationSingleton } from "./CelebrationController";
import "./Celebrator.css";

export function Celebrator() {
  const [celebration, setCelebration] = useState(
    celebrationSingleton.currentCelebration
  );

  useEffect(() => {
    const onCelebrate = (celebration: Celebration) => {
      setCelebration(celebration);
    };
    const onCelebrateEnd = () => {
      setCelebration(undefined);
    };
    celebrationSingleton.events.on("celebrationStarted", onCelebrate);
    celebrationSingleton.events.on("celebrationFinished", onCelebrateEnd);
    return () => {
      celebrationSingleton.events.off("celebrationStarted", onCelebrate);
      celebrationSingleton.events.off("celebrationFinished", onCelebrateEnd);
    };
  }, []);

  // const celebration: Celebration = {
  //   type: "tutorial",
  //   content: "Wow What a World!"
  // };
  return celebration ? <CelebrationOverlay celebration={celebration} /> : null;
}

type CelebrationOverlayProps = {
  celebration: Celebration;
};

function CelebrationOverlay(props: CelebrationOverlayProps) {
  const { celebration } = props;
  const { type: celebrationType = "progression" } = celebration;

  useEffect(() => {
    const celebrate = async () => {
      for (let i = 0; i < 4; i++) {
        await wait(1000);
        confetti({
          zIndex: 2000,
          origin: {
            x: 0.25,
            y: 0.75
          }
        });
        confetti({
          zIndex: 2000,
          origin: {
            x: 0.75,
            y: 0.75
          }
        });
      }
    };
    celebrate();
  }, []);

  const celebrationTypeString = {
    progression: "Progress",
    codingChallenge: "Challenge Complete",
    tutorial: "Tutorial Completed",
    achievement: "Achievement Unlocked"
  }[celebrationType];

  const celebrationIcon: IconName =
    celebration.icon && isSupportedIcon(celebration.icon)
      ? celebration.icon
      : "gameLogo";

  return (
    <div className="celebration-overlay">
      <div className="celebration-color-splash" />
      <div className="celebration-container">
        <div className="hex-bg" />
        <div className="celebration-container-inner-hex">
          <div className="hex-bg" />
        </div>
        <div className="celebration-icon-container">
          <Icon
            icon={celebrationIcon}
            className="celebration-icon"
            size="fill"
          />
        </div>
        <div className="celebration-type">{celebrationTypeString}</div>
        <div className="celebration-content">{celebration.content}</div>
        <div className="celebration-checkbox-container">
          <div className="celebration-check" />
        </div>
      </div>
    </div>
  );
}
