import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

type EncryptedWallTextExtraInfo = {
  decrypted: boolean;
};

@autoTranslateClass()
export class EncryptedWallTextInfo extends EntityInfo {
  static type = "EncryptedWallText";

  @exposeProp()
  decrypt() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "decrypt",
      []
    );
  }

  @exposeProp()
  get decrypted() {
    return (this.extra as EncryptedWallTextExtraInfo).decrypted;
  }
}
