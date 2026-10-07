import { faHandPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { selectGamePaused } from "src/redux/gameState/selectors";
import { useAppSelector } from "src/redux/hooks";

import "./FocusLostIndicator.less";

export function FocusLostIndicator() {
  const { t } = useTranslation();
  const [windowFocused, setWindowFocused] = useState(document.hasFocus());
  const [fieldFocused, setFieldFocused] = useState(false);
  const isPaused = useAppSelector(selectGamePaused);

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isTextInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        !!target.closest("[contenteditable]");
      if (isTextInput) setFieldFocused(true);
    };
    const onFocusOut = () => setFieldFocused(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const controlsBlocked = !windowFocused || fieldFocused;

  // Don't show when game is paused
  if (!controlsBlocked || isPaused) return null;

  return (
    <div className="focus-lost-indicator">
      <div className="focus-lost-indicator-label">
        <FontAwesomeIcon
          icon={faHandPointer}
          className="focus-lost-indicator-icon"
        />
        {t("focusLost.tapText")}
      </div>
    </div>
  );
}
