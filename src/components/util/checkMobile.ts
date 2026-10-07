import { extractOptsFromCurrentURL } from "src/util/devUtil";

export function checkMobile() {
  // Detect common user agents
  if (
    navigator.userAgent.match(/Android/i) ||
    navigator.userAgent.match(/iPhone/i)
  ) {
    return true;
  }
  // Detect explicitly-defined mobile mode.
  const devOpts = extractOptsFromCurrentURL();
  if (devOpts?.isMobile) return true;
  return false;
}
