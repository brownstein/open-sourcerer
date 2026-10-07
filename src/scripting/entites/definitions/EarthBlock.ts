import { arr2, vector2ToArr2 } from "src/engine/util/vecTypes";
import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import {
  EarthBlockConstructorArg,
  earthBlockConstructorValidator
} from "src/scripting/modules/auto/validators/earthValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { isKnownError } from "src/scripting/runtime/SpellErrors";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

@autoTranslateClass({
  constructorAsync: true,
  constructorValidator: earthBlockConstructorValidator
})
export class EarthBlock extends EntityInfo {
  static type = "EarthBlock";
  public type = EarthBlock.type;

  protected opts?: EarthBlockConstructorArg;

  constructor(opt?: EarthBlockConstructorArg) {
    super();
    this.opts = opt;
  }

  async postConstruct(runner: JSRunnerAPI) {
    this.runner = runner;
    const sync = spellEntitySyncFromRunner(this.runner);
    if (!sync) return;
    sync.setTracked(this.trackingId, this);
    if (!this.trackingId.persistentHandleId) return;
    const opt = this.opts;

    let drawShape = false;
    if (opt?.drawShape) drawShape = true;
    let shape: arr2[] | undefined;
    if (opt?.shape) {
      shape = opt.shape.map((v) => (Array.isArray(v) ? v : vector2ToArr2(v)));
    } else if (opt?.rect) {
      shape = [
        [-opt.rect.width * 0.5, -opt.rect.height * 0.5],
        [opt.rect.width * 0.5, -opt.rect.height * 0.5],
        [opt.rect.width * 0.5, opt.rect.height * 0.5],
        [-opt.rect.width * 0.5, opt.rect.height * 0.5]
      ];
    } else if (opt?.circle) {
      shape = [];
      const radius = opt.circle.radius;
      for (let i = 0; i < 32; i++) {
        shape.push([
          radius * Math.cos((i * Math.PI) / 16),
          radius * Math.sin((i * Math.PI) / 16)
        ]);
      }
    }
    let holes: arr2[][] | undefined;
    if (opt?.holes) {
      holes = opt.holes
        .map((hole) =>
          hole.map((v) => (Array.isArray(v) ? v : vector2ToArr2(v)))
        )
        .filter(Boolean);
    }
    let offset: arr2 | undefined;
    if (opt?.offset) {
      offset = Array.isArray(opt.offset)
        ? opt.offset
        : vector2ToArr2(opt.offset);
    }
    const angle = opt?.angle ?? 0;

    try {
      const result = await this.rpcs.castEarthBlockSync({
        useHandleId: this.trackingId.persistentHandleId,
        casterId: opt?.spark?.id ?? undefined,
        drawShape,
        shape,
        holes,
        angle,
        offset
      });
      if (!result.id?.persistentHandleId) {
        throw new Error(
          ("reason" in result && result.reason) || "Failed to construct Earth."
        );
      }
    } catch (err) {
      throw new Error(
        isKnownError(err) ? err.message : "Failed to construct Earth."
      );
    }
  }

  /** RPC proxy onto the main-thread EarthBlockNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Earth]: EarthBlock is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).EarthBlockNative;
  }

  @exposeProp()
  public async destroy() {
    if (this.id) await this.rpcs.destroyEarthBlock(this.id);
  }

  @exposeProp()
  public async detachFromTerrain() {
    if (this.id) return this.rpcs.detachEarthBlock(this.id);
    return false;
  }
}
