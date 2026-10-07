import React from "react";

import "./AdanaDialogueWrapper.less";

export function AdanaDialogueWrapper(props: {
  children: React.ReactElement | React.ReactElement[];
  showNext?: boolean;
  onNext?: () => void;
}) {
  const { children, showNext, onNext } = props;
  return (
    <div className="adana-dialogue-wrapper">
      {children}
      {showNext && <div onClick={onNext} className="adana-dialogue-next" />}
    </div>
  );
}
