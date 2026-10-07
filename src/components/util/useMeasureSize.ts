import { useLayoutEffect, useRef, useState } from "react";

export type Size = {
  width: number;
  height: number;
};

const defaultZeroSize: Size = {
  width: 0,
  height: 0
};

/**
 * This is a size measuring utility similar to react-use's useMeasure, except it only
 * provides information about the width and height of an element, improving performance
 * outcomes when element size remains constant while elements move around.
 *
 * Note that the measured element SHOULD NOT change over a component's lifecycle.
 */
export function useMeasureSize<EL extends HTMLElement = HTMLDivElement>(
  currentRef?: React.RefObject<EL | null> | null,
  defaultSize?: Size | null
): [React.RefObject<EL | null>, Size] {
  const elRef = useRef<EL>(currentRef?.current ?? null);
  if (currentRef?.current) elRef.current = currentRef.current;
  const [size, setSize] = useState<Size>(defaultSize ?? defaultZeroSize);

  useLayoutEffect(() => {
    const element = elRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const firstEntry = entries.at(0);
      if (firstEntry) {
        const { width, height } = firstEntry.contentRect;
        setSize((extant) => {
          if (extant.width === width && extant.height === height) return extant;
          return { width, height };
        });
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [elRef, size];
}
