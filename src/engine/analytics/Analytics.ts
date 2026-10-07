import ReactGA from "react-ga4";

const TRACKING_ID = "G-YRNNCK6H5E";

// The standalone desktop build serves the game from a local app:// origin —
// analytics are undesirable there and blocked by CSP anyway.
const analyticsEnabled =
  typeof window !== "undefined" && window.location.protocol !== "app:";

if (analyticsEnabled) {
  ReactGA.initialize([
    {
      trackingId: TRACKING_ID
    }
  ]);
}

export function analyticsTrackPageView() {
  if (!analyticsEnabled) return;
  ReactGA.send({
    hitType: "pageView",
    page: "/",
    title: document.title
  });
}

export function analyticsTrackLevelProgression(levelId: string) {
  if (!analyticsEnabled) return;
  ReactGA.event({
    category: "Level Progression",
    action: "LevelStart",
    label: levelId
  });
}
