import { useEffect, useState } from "react";

import { CollabIdentity } from "./collabTypes";
import { levelEditorSession } from "./session";

/** Layer id to identities of members currently editing that layer. Fingerprint
 *  compared so the 15-20Hz awareness traffic doesn't churn React renders. */
export function useMemberLayerPresence(): Map<string, CollabIdentity[]> {
  const [byLayer, setByLayer] = useState<Map<string, CollabIdentity[]>>(
    () => new Map()
  );

  useEffect(() => {
    let lastFingerprint = "";
    const update = () => {
      const next = new Map<string, CollabIdentity[]>();
      const parts: string[] = [];
      for (const member of levelEditorSession.getMembers()) {
        if (member.isSelf || member.state.away) continue;
        const layerId = member.state.presence?.activeLayerId;
        if (!layerId) continue;
        const identities = next.get(layerId) ?? [];
        identities.push(member.state.identity);
        next.set(layerId, identities);
        const { name, color, iconKey } = member.state.identity;
        parts.push(`${layerId}:${name}:${color}:${iconKey}`);
      }
      const fingerprint = parts.sort().join("|");
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      setByLayer(next);
    };
    update();
    levelEditorSession.events.on("membersChanged", update);
    levelEditorSession.events.on("sessionChanged", update);
    return () => {
      levelEditorSession.events.off("membersChanged", update);
      levelEditorSession.events.off("sessionChanged", update);
    };
  }, []);

  return byLayer;
}
