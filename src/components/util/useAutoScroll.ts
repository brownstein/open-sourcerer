import {
  RefObject,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef
} from "react";

export type ScrollToAlign = "top" | "bottom";

export type ScrollCtxType = {
  scrollToElement: (el: HTMLElement, align?: ScrollToAlign) => void;
} | null;

export const ScrollCtx = createContext<ScrollCtxType>(null);

export function useAutoScroll<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  duration = 500
) {
  const currentRequestRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  const scrollToElement = useCallback(
    (el: HTMLElement, align: ScrollToAlign = "bottom") => {
      if (currentRequestRef.current) {
        cancelAnimationFrame(currentRequestRef.current);
        currentRequestRef.current = null;
      }
      const containerEl = containerRef.current;
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      const initialScroll = containerEl.scrollTop;
      let finalScroll = initialScroll;
      if (align === "top") {
        finalScroll = elRect.top - containerRect.top;
      } else {
        finalScroll =
          elRect.top +
          elRect.height -
          (containerRect.top + containerRect.height);
      }

      let ms = 15;
      let lastTime = performance.now();
      const doFrame = () => {
        const now = performance.now();
        ms += now - lastTime;
        lastTime = now;
        if (ms >= duration) {
          containerEl.scrollTo({ top: finalScroll });
          return;
        }
        const lerp = ms / duration;
        const top = initialScroll * (1 - lerp) + finalScroll * lerp;
        containerEl.scrollTo({ top });
        requestAnimationFrame(doFrame);
      };
      doFrame();
    },
    [containerRef, duration]
  );

  useEffect(() => {
    return () => {
      if (currentRequestRef.current) {
        cancelAnimationFrame(currentRequestRef.current);
        currentRequestRef.current = null;
      }
    };
  }, []);

  return useMemo<ScrollCtxType>(() => ({ scrollToElement }), [scrollToElement]);
}

export function useAutoScrollTarget() {
  const ctx = useContext(ScrollCtx);
  const { scrollToElement } = ctx ?? {};
  return scrollToElement;
}

export function useEagerAutoScrollTarget<T extends HTMLElement>(
  ref: RefObject<T | null>
) {
  const ctx = useContext(ScrollCtx);
  useEffect(() => {
    if (!ref.current) return;
    ctx?.scrollToElement(ref.current);
  }, [ctx, ref]);
}

export function AutoScrollTarget() {
  const ref = useRef<HTMLDivElement>(null);
  useEagerAutoScrollTarget(ref);
  return createElement("div", {
    ref
  });
}
