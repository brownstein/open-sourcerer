import { CSSProperties, useEffect, useRef } from "react";

import { delay } from "src/scripting/core/util";

import "./Countdown.less";

export type CountdownProps = {
  totalMs: number;
};

export function Countdown(props: CountdownProps) {
  const { totalMs } = props;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    delay(1).then(() => el.style.setProperty("--tAngle", "360deg"));
  }, [totalMs]);

  return (
    <div
      ref={ref}
      className="countdown-circle"
      style={
        {
          "--timeout": `${totalMs}ms`
        } as CSSProperties
      }
    />
  );
}
