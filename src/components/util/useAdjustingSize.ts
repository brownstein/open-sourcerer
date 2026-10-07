import { useEffect, useState } from "react";

function _sizeStr(rect: { width: number; height: number }) {
  return `${rect.width}-${rect.height}`;
}

export function useAdjustingSize(
  ref: React.MutableRefObject<HTMLElement | null>,
  ms: number = 500
): boolean {
  const [adjustingSize, setAdjustingSize] = useState(true);
  useEffect(() => {
    const el = ref.current;
    let currentSizeStr = "";
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const onResizeTimeout = () => {
      setAdjustingSize(false);
    };
    if (el) {
      currentSizeStr = _sizeStr(el.getBoundingClientRect());
      resizeTimeout = setTimeout(onResizeTimeout, ms);
    }
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const sizeStr = _sizeStr(entry.contentRect);
        if (sizeStr !== currentSizeStr) {
          if (resizeTimeout !== null) clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(onResizeTimeout, ms);
          currentSizeStr = sizeStr;
          setAdjustingSize(true);
        }
      }
    });
    if (el) resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
    };
  }, [ref, ms]);
  return adjustingSize;
}
