// Detects use of Chrome vs other browsers.
export function detectIsChrome() {
  return navigator.userAgent.includes("Chrome");
}
