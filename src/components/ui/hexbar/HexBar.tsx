import cx from "classnames";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import "./HexBar.css";

type HexBarSubSegmentProps = {
  frac: number;
};

function HexBarSubSegment(props: HexBarSubSegmentProps) {
  const { frac } = props;

  const subSegRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const subSegEl = subSegRef.current;
    if (!subSegEl) return;
    subSegEl.style.setProperty("--sbar-segment-frac", `${frac}`);
  }, [frac]);
  return <div className={cx("hex-bar-subsegment")} ref={subSegRef} />;
}

type HexBarSegmentProps = {
  className?: string;
  startFrac: number;
  endFrac: number;
  barSubSegmentCount: number;
};

function HexBarSegment(props: HexBarSegmentProps) {
  const { className, startFrac, endFrac, barSubSegmentCount } = props;

  const segRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const segEl = segRef.current;
    if (!segEl) return;
    segEl.style.setProperty("--sbar-segment-offset", `${startFrac}`);
    segEl.style.setProperty("--sbar-segment-width", `${endFrac - startFrac}`);
  }, [startFrac, endFrac]);

  const subSegments = useMemo(() => {
    const segments: HexBarSubSegmentProps[] = [];
    const firstSegOffset =
      ((1 - startFrac) % (1 / barSubSegmentCount)) + 0.25 / barSubSegmentCount;
    segments.push({
      frac: firstSegOffset
    });
    let totalSegmentCount = Math.ceil(
      (endFrac - startFrac) * barSubSegmentCount
    );
    if (endFrac + 0.5 < 1) totalSegmentCount++;
    for (let i = 1; i < totalSegmentCount; i++) {
      segments.push({
        frac: 1 / barSubSegmentCount
      });
    }
    if (endFrac + 0.5 >= 1) {
      const lastSeg = segments.at(-1);
      if (lastSeg) lastSeg.frac += 0.5;
    }
    return segments;
  }, [startFrac, endFrac, barSubSegmentCount]);

  return (
    <div className={cx("hex-bar-segment", className)} ref={segRef}>
      <div className="hex-bar-segment-hex-clip">
        <div className="hex-bar-segment-inner">
          {subSegments.map((s, i) => (
            <HexBarSubSegment key={i} frac={s.frac} />
          ))}
        </div>
      </div>
    </div>
  );
}

type HexBarSegmentBorderProps = {
  className?: string;
  startFrac: number;
  endFrac: number;
};

function HexBarSegmentBorder(props: HexBarSegmentBorderProps) {
  const { className, startFrac, endFrac } = props;

  const segRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const segEl = segRef.current;
    if (!segEl) return;
    segEl.style.setProperty("--sbar-segment-offset", `${startFrac}`);
    segEl.style.setProperty("--sbar-segment-width", `${endFrac - startFrac}`);
  }, [startFrac, endFrac]);

  return (
    <div className={cx("hex-bar-segment-border", className)} ref={segRef}>
      <div className="hex-bar-segment-border-hex-clip">
        <div className="hex-bar-segment-border-inner"></div>
      </div>
    </div>
  );
}

export type HexBarProps = {
  className?: string;
  valueFrac: number;
  subSegmentCount?: number;
  onClick?: () => void;
};

type FallingHexSegment = HexBarSegmentProps & {
  droppedAt: number;
};

export function HexBar(props: HexBarProps) {
  const { className, valueFrac, subSegmentCount = 10, onClick } = props;

  const [baseSegment, setBaseSegment] = useState<HexBarSegmentProps>({
    startFrac: 0,
    endFrac: valueFrac,
    barSubSegmentCount: subSegmentCount
  });
  const [fallingSegments, setFallingSegments] = useState<FallingHexSegment[]>(
    []
  );

  const lastValueFracRef = useRef<number>(valueFrac);
  useLayoutEffect(() => {
    const lastValueFrac = lastValueFracRef.current;
    lastValueFracRef.current = valueFrac;
    setBaseSegment({
      startFrac: 0,
      endFrac: valueFrac,
      barSubSegmentCount: subSegmentCount
    });
    if (lastValueFrac !== valueFrac) {
      const lossFrac = lastValueFrac - valueFrac;
      if (lossFrac > 0) {
        const now = Date.now();
        setFallingSegments((s) => [
          ...s,
          {
            droppedAt: now,
            startFrac: valueFrac,
            endFrac: lastValueFrac,
            barSubSegmentCount: subSegmentCount
          }
        ]);
      }
    }
  }, [valueFrac, subSegmentCount]);

  // Schedule old sub-segment removal.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFallingSegments((fs) => {
        if (!fs.some((seg) => now - seg.droppedAt > 1000)) return fs;
        return fs.filter((seg) => now - seg.droppedAt <= 1000);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cx("hex-bar-container", className)} onClick={onClick}>
      <div className="hex-bar-container-bg" />
      <div className="hex-bar">
        <HexBarSegmentBorder
          startFrac={baseSegment.startFrac}
          endFrac={baseSegment.endFrac}
        />
        <HexBarSegment
          startFrac={baseSegment.startFrac}
          endFrac={baseSegment.endFrac}
          barSubSegmentCount={subSegmentCount}
        />
        {fallingSegments.map((fs, i) => (
          <HexBarSegment
            key={i}
            className="hex-segment-falling"
            startFrac={fs.startFrac}
            endFrac={fs.endFrac}
            barSubSegmentCount={subSegmentCount}
          />
        ))}
      </div>
    </div>
  );
}
