import cx from "classnames";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Box2, Vector2 } from "three";

import "./Arrow.css";

type ArrowPathProps = {
  from: Vector2;
  fromDelta?: Vector2;
  to: Vector2;
  toDelta?: Vector2;
  headSize: number;
  headAngle?: number;
  backoffDist?: number;
  subBbox?: boolean;
};

type ArrowPath = {
  bbox: Box2;
  headPath: string;
  linePath: string;
};

function generateArrowPath(arrowProps: ArrowPathProps): ArrowPath {
  const bbox = new Box2();
  const tip = arrowProps.to.clone();
  let tipDelta: Vector2;
  if (arrowProps.toDelta) {
    tipDelta = arrowProps.toDelta?.clone();
  } else {
    const fromPlusDelta = arrowProps.from.clone();
    if (arrowProps.fromDelta) fromPlusDelta.add(arrowProps.fromDelta);
    tipDelta = arrowProps.to.clone().sub(fromPlusDelta);
  }
  if (arrowProps.backoffDist) {
    tipDelta.normalize().multiplyScalar(arrowProps.backoffDist);
    tip.sub(tipDelta.clone().multiplyScalar(arrowProps.backoffDist));
  }
  tipDelta.normalize().multiplyScalar(arrowProps.headSize);
  const headAngle = arrowProps.headAngle ?? Math.PI * 0.25;
  const tipLeft = tip
    .clone()
    .sub(tipDelta.clone().rotateAround(new Vector2(), -headAngle * 0.5));
  const tipRight = tip
    .clone()
    .sub(tipDelta.clone().rotateAround(new Vector2(), headAngle * 0.5));
  const tipBottom = tipRight.clone().add(tipLeft).multiplyScalar(0.5);

  bbox.expandByPoint(tip).expandByPoint(tipLeft).expandByPoint(tipRight);
  const fromR = arrowProps.from;
  const toR = tipBottom;
  bbox.expandByPoint(fromR);
  bbox.expandByPoint(toR);
  // This number is arbitrary, but it should cover standard width adjustments.
  bbox.expandByScalar(16);

  if (arrowProps.subBbox) {
    tip.sub(bbox.min);
    tipLeft.sub(bbox.min);
    tipRight.sub(bbox.min);
    fromR.sub(bbox.min);
    toR.sub(bbox.min);
  }

  const headPath = [
    `M ${tip.x.toFixed(3)} ${tip.y.toFixed(3)}`,
    `L ${tipRight.x.toFixed(3)} ${tipRight.y.toFixed(3)}`,
    `L ${tipLeft.x.toFixed(3)} ${tipLeft.y.toFixed(3)}`,
    `L ${tip.x.toFixed(3)} ${tip.y.toFixed(3)}`
  ].join(" ");

  const linePathArr: string[] = [];
  if (arrowProps.fromDelta) {
    const fromPlusDeltaR = arrowProps.from.clone().add(arrowProps.fromDelta);
    linePathArr.push(
      `${fromPlusDeltaR.x.toFixed(3)} ${fromPlusDeltaR.y.toFixed(3)}`
    );
  }
  if (arrowProps.toDelta) {
    const toMinusDeltaR = tipBottom.clone().sub(arrowProps.toDelta);
    linePathArr.push(
      `${toMinusDeltaR.x.toFixed(3)} ${toMinusDeltaR.y.toFixed(3)}`
    );
  }
  linePathArr.push(`${toR.x.toFixed(3)} ${toR.y.toFixed(3)}`);
  let linePath = `M ${fromR.x} ${fromR.y} L ${linePathArr.at(0)}`;
  if (linePathArr.length === 2)
    linePath = `M ${fromR.x} ${fromR.y} S ${linePathArr.join(", ")}`;
  if (linePathArr.length === 3)
    linePath = `M ${fromR.x} ${fromR.y} C ${linePathArr.join(", ")}`;

  bbox.min.floor();
  bbox.max.ceil();

  return {
    bbox,
    headPath,
    linePath
  };
}

export type ArrowProps = Omit<ArrowPathProps, "headSize"> & {
  color?: string;
  headSize?: number;
  lineWidth?: number | string;
  className?: string;
  style?: CSSProperties;
  tipStyle?: CSSProperties;
  lineStyle?: CSSProperties;
  fixed?: boolean;
};

export function Arrow(props: ArrowProps) {
  const {
    color = "#000",
    from,
    fromDelta,
    to,
    toDelta,
    headSize = 20,
    headAngle,
    backoffDist = 2,
    lineWidth = "4pt",
    className,
    style,
    tipStyle,
    lineStyle,
    fixed = true
  } = props;

  const { headPath, linePath, bbox } = useMemo(
    () =>
      generateArrowPath({
        from,
        fromDelta,
        to,
        toDelta,
        headSize,
        headAngle,
        backoffDist,
        subBbox: !fixed
      }),
    [from, fromDelta, to, toDelta, headSize, headAngle, backoffDist, fixed]
  );

  const [windowSize, setWindowSize] = useState([
    window.innerWidth,
    window.innerHeight
  ]);
  useEffect(() => {
    const onResize = () =>
      setWindowSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const [viewBoxSize, styleWithOverrides] = useMemo(() => {
    const size = fixed
      ? windowSize
      : [bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y];
    return [
      size,
      {
        ...style,
        ...(fixed
          ? undefined
          : {
              left: bbox.min.x,
              top: bbox.min.y,
              width: size[0],
              height: size[1]
            })
      }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize, fixed, bbox]);

  const viewBox = useMemo(
    () => `0 0 ${viewBoxSize[0]} ${viewBoxSize[1]}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewBoxSize[0], viewBoxSize[1]]
  );

  return (
    <svg
      className={cx("arrow-overlay", className, { fixed })}
      style={styleWithOverrides}
      viewBox={viewBox}
    >
      <path
        d={linePath}
        style={{
          stroke: color,
          strokeWidth: lineWidth,
          fill: "none",
          ...lineStyle
        }}
      />
      <path
        d={headPath}
        style={{
          stroke: "none",
          strokeWidth: 0,
          fill: color,
          ...tipStyle
        }}
      />
    </svg>
  );
}
