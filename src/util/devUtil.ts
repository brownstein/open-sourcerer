export function isDevMode() {
  if (typeof window === "undefined") return false;
  if (window.location.href?.includes("__nodev__")) return false;
  if (window.location.href?.includes("__developer__")) return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export interface IDevModeOpts {
  isDevMode?: boolean;
  isMobile?: boolean;
  isDemoMode?: boolean;
  showDevOverlay?: boolean;
  level?: string;
  mode?: string;
}

export function extractOptsFromCurrentURL(): IDevModeOpts | null {
  if (!isDevMode()) return null;
  if (typeof window === "undefined") return null;
  const urlSearchParams = new URLSearchParams(window.location.search);
  let level: string | undefined;
  if (urlSearchParams.has("level")) {
    switch (urlSearchParams.get("level")) {
      case "":
      case "null":
        break;
      default:
        level = urlSearchParams.get("level") || undefined;
        break;
    }
  }
  return {
    isDevMode: true,
    showDevOverlay: urlSearchParams.get("__devOverlay__")
      ? urlSearchParams.get("__devOverlay__") !== "0"
      : false,
    isMobile: !!urlSearchParams.get("__mobile__"),
    isDemoMode: !!urlSearchParams.get("__demoMode__"),
    level,
    mode: urlSearchParams.get("mode") || undefined
  };
}

export function applyOptsToCurrentURL(opts: IDevModeOpts) {
  if (typeof window === "undefined") return null;
  const urlSearchParams = new URLSearchParams();
  if (opts.isDevMode) urlSearchParams.set("__developer__", "1");
  if (opts.isMobile) urlSearchParams.set("__mobile__", "1");
  if (opts.isDemoMode) urlSearchParams.set("__demoMode__", "1");
  if (opts.showDevOverlay !== undefined)
    urlSearchParams.set("__devOverlay__", opts.showDevOverlay ? "1" : "0");
  if (opts.level) urlSearchParams.set("level", opts.level);
  if (opts.mode) urlSearchParams.set("mode", opts.mode);
  const qs = urlSearchParams.toString();
  if (qs !== "") {
    window.history.pushState({ page: 1 }, "", `?${qs}`);
  }
}
