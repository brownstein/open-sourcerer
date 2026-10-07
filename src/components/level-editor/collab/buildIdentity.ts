// Build identity for collaboration version warnings. Everything here is
// advisory; a failed or mismatched check never blocks hosting or joining.

/** Where deployed designers live; dev servers compare themselves against it. */
const DEPLOYED_VERSION_URL =
  "https://brownstein.github.io/osts-v3/version.json";

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "unknown";

export function isDevBuild(): boolean {
  return import.meta.env.DEV;
}

export type VersionCheckResult =
  | { kind: "current" }
  | { kind: "stale"; deployedBuildId: string }
  | { kind: "devBuild"; deployedBuildId: string }
  | { kind: "unavailable" };

/** Compare this client against the deployed build. Cache-busted so a stale
 *  designer left open for days still sees the newest deploy. */
export async function checkDeployedVersion(): Promise<VersionCheckResult> {
  let deployed: { buildId?: unknown };
  try {
    const response = await fetch(`${DEPLOYED_VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) return { kind: "unavailable" };
    deployed = await response.json();
  } catch {
    return { kind: "unavailable" };
  }
  const deployedBuildId =
    typeof deployed.buildId === "string" ? deployed.buildId : null;
  if (!deployedBuildId) return { kind: "unavailable" };

  if (isDevBuild()) {
    return deployedBuildId === BUILD_ID
      ? { kind: "current" }
      : { kind: "devBuild", deployedBuildId };
  }
  if (deployedBuildId !== BUILD_ID) {
    return { kind: "stale", deployedBuildId };
  }
  return { kind: "current" };
}
