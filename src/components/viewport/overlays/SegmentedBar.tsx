import cx from "classnames";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import shortid from "shortid";
import { Color } from "three";

import { ElementalType } from "src/api/entity";
import { useAnimatedTransition } from "src/components/util/useAnimatedTransition";

import "./SegmentedBar.less";

const ELEMENTAL_FADING_CHUNK_COLORS: Record<ElementalType, string> = {
  [ElementalType.Mana]: "#22aacc",
  [ElementalType.Fire]: "#ff8833",
  [ElementalType.Ice]: "#88ccff",
  [ElementalType.Electricity]: "#ffee44",
  [ElementalType.Nature]: "#44cc44",
  [ElementalType.Wind]: "#aaaaaa",
  [ElementalType.Earth]: "#aa7744"
};

const ELEMENTAL_BAR_OUTLINE_COLORS: Record<ElementalType, string> = {
  [ElementalType.Mana]: "#22aacc",
  [ElementalType.Fire]: "#ff8833",
  [ElementalType.Ice]: "#88ccff",
  [ElementalType.Electricity]: "#ffee44",
  [ElementalType.Nature]: "#44cc44",
  [ElementalType.Wind]: "#aaaaaa",
  [ElementalType.Earth]: "#aa7744"
};

// Durations match StatusBehavior sprite glow per element
const ELEMENTAL_EFFECT_DURATION_MS: Record<ElementalType, number> = {
  [ElementalType.Mana]: 200,
  [ElementalType.Fire]: 1500,
  [ElementalType.Ice]: 100,
  [ElementalType.Electricity]: 100,
  [ElementalType.Nature]: 200,
  [ElementalType.Wind]: 800,
  [ElementalType.Earth]: 100
};

// TODO: move all this bar segmentation elsewhere.

export type FadingBarChunkProps = {
  left: number;
  width: number;
  height: number;
  color: string;
  transitionDuration: number;
  gravityDirection: number;
  onTransitionDone: () => unknown;
};

export function FadingBarChunk(props: FadingBarChunkProps) {
  const {
    left,
    width,
    height,
    color,
    transitionDuration,
    gravityDirection,
    onTransitionDone
  } = props;
  const t = useAnimatedTransition({
    started: true,
    duration: transitionDuration,
    onComplete: onTransitionDone
  });
  return (
    <div
      className="ui-bar-filled-chunk"
      style={{
        left,
        top: gravityDirection * t * height * 2 + 2,
        width,
        height,
        background: color,
        opacity: 1 - t,
        transform: `rotate(${Math.floor(gravityDirection * t * 20)}deg)`
      }}
    />
  );
}

export type AllocatedBarChunkProps = {
  left: number;
  leftInitial: number;
  width: number;
  height: number;
  extraHeight: number;
  color: string;
  transitionDuration: number;
};

export function AllocatedBarChunk(props: AllocatedBarChunkProps) {
  const {
    left,
    leftInitial,
    width,
    height,
    extraHeight,
    color,
    transitionDuration
  } = props;
  const t = useAnimatedTransition({
    started: true,
    duration: transitionDuration
  });
  return (
    <div
      className="ui-bar-filled-chunk"
      style={{
        left: leftInitial + (left - leftInitial) * t,
        top: -extraHeight * t,
        width,
        height: height + extraHeight * t * 2,
        background: color,
        opacity: t
      }}
    />
  );
}

type Allocation = {
  id: string;
  value: number;
};
export type SegmentedBarProps = {
  className?: string;
  width?: number;
  height?: number;
  maxValue?: number;
  fadingBarGravity?: number;
  showNumericValue?: boolean;
  value: number;
  valueAllocations?: Allocation[];
  color: string;
  bgColor: string;
  fadingChunkColor?: string;
  outlineColor?: string;
  outlineDurationMs?: number;
};

enum BarChunkType {
  Allocated = "Allocated",
  Lost = "Lost"
}

type FloatingBarSegment = {
  key: string;
  type: BarChunkType;
  left: number;
  leftInitial?: number;
  width: number;
  chunkColor?: string;
};

enum GravityDirection {
  down = 1,
  up = -1
}

export function SegmentedBar(props: SegmentedBarProps) {
  const {
    className,
    width = 200,
    height = 16,
    maxValue = 100,
    fadingBarGravity = GravityDirection.down,
    showNumericValue = false,
    value,
    valueAllocations,
    color,
    bgColor,
    fadingChunkColor,
    outlineColor,
    outlineDurationMs = 600
  } = props;

  const [floatingSegments, setFloatingSegments] = useState<
    FloatingBarSegment[]
  >([]);
  const prevValueRef = useRef<number>(0);
  const _prevValueAllocations = useRef<Allocation[] | undefined>(undefined);

  useEffect(() => {
    const prevValue = prevValueRef.current;
    prevValueRef.current = value;
    setFloatingSegments((fs) => {
      const allocatedIdMap: Record<string, Allocation> = {};
      let totalAllocatedValue = 0;
      if (valueAllocations !== undefined) {
        for (const allocation of valueAllocations) {
          allocatedIdMap[allocation.id] = allocation;
        }
      }
      const newSegments: FloatingBarSegment[] = [];
      const newSegmentAllocatedIds = new Set<string>();
      let rightFraq = 0;
      for (const segment of fs) {
        if (segment.type === BarChunkType.Lost) {
          newSegments.push(segment);
          continue;
        }
        const allocated = allocatedIdMap[segment.key];
        if (allocated) {
          const segRelativeWidth = allocated.value / maxValue;
          const segWidth = width * segRelativeWidth;
          const segLeft = (1 - rightFraq) * width + 2 - segWidth;
          newSegments.push({
            ...segment,
            left: segLeft,
            width: segWidth
          });
          rightFraq += segRelativeWidth;
          newSegmentAllocatedIds.add(allocated.id);
          totalAllocatedValue += allocated.value;
        } else {
          newSegments.push({ ...segment, type: BarChunkType.Lost });
        }
      }
      if (valueAllocations !== undefined) {
        for (const allocation of valueAllocations) {
          if (newSegmentAllocatedIds.has(allocation.id)) continue;
          const segRelativeWidth = allocation.value / maxValue;
          const segWidth = width * segRelativeWidth;
          const segLeft = (1 - rightFraq) * width + 2 - segWidth;
          const segLeftRelativeInitial =
            prevValue / maxValue - segRelativeWidth;
          const segLeftInitial = segLeftRelativeInitial * width + 2;
          newSegments.push({
            key: allocation.id,
            type: BarChunkType.Allocated,
            left: segLeft,
            leftInitial: segLeftInitial,
            width: segWidth
          });
          rightFraq += segRelativeWidth;
          totalAllocatedValue += allocation.value;
        }
      }
      if (value < prevValue - totalAllocatedValue) {
        const segRelativeWidth =
          (prevValue - totalAllocatedValue - value) / maxValue;
        newSegments.push({
          key: shortid(),
          type: BarChunkType.Lost,
          width: segRelativeWidth * width,
          left: (width * value) / maxValue + 2,
          chunkColor: fadingChunkColor
        });
      }
      return newSegments;
    });
  }, [
    value,
    valueAllocations,
    maxValue,
    prevValueRef,
    width,
    fadingChunkColor
  ]);

  const bgBarStyle: CSSProperties = {
    backgroundColor: bgColor,
    borderRadius: "2.5px"
  };

  const fullBarStyle: CSSProperties = {
    width: `${Math.round((100 * value) / maxValue)}%`, // Math.max(0, (width - 4) * (value / maxValue)),
    background: color,
    borderRadius: "2.5px"
  };

  const wrapperStyle = {
    width,
    height
  };

  const allocationColor = useMemo(() => {
    const hexMatch = color.match(/#[0-9a-fA-F]{6}/);
    const baseColor = hexMatch ? hexMatch[0] : color;
    return `#${new Color(baseColor).lerp(new Color(0xffffff), 0.5).getHexString()}`;
  }, [color]);

  let barNumericValues = null;
  if (showNumericValue) {
    barNumericValues = (
      <div className="ui-bar-numeric-value">
        {Math.ceil(value)}/{maxValue}
      </div>
    );
  }

  return (
    <div className={cx("ui-bar-wrapper", className)} style={wrapperStyle}>
      <div className="ui-bar">
        <div className="ui-bar-filled-bg-border" />
        <div className="ui-bar-filled-bg" style={bgBarStyle} />
        <div className="ui-bar-filled" style={fullBarStyle} />
        {floatingSegments.map((s) =>
          s.type === BarChunkType.Lost ? (
            <FadingBarChunk
              key={s.key}
              left={s.left}
              width={s.width}
              height={height}
              color={s.chunkColor || color}
              gravityDirection={fadingBarGravity}
              transitionDuration={250}
              onTransitionDone={() =>
                setFloatingSegments((fs) => fs.filter((f) => f.key !== s.key))
              }
            />
          ) : (
            <AllocatedBarChunk
              key={s.key}
              left={s.left}
              leftInitial={s.leftInitial ?? s.left}
              width={s.width}
              height={height}
              extraHeight={3}
              color={allocationColor}
              transitionDuration={250}
            />
          )
        )}
      </div>
      {outlineColor && (
        <div
          key={outlineColor}
          className="ui-bar-tint"
          style={{
            borderColor: outlineColor,
            animationDuration: `${outlineDurationMs}ms`
          }}
        />
      )}
      {barNumericValues}
    </div>
  );
}
