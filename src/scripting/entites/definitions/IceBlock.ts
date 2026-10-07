import { arr2, vector2ToArr2 } from "src/engine/util/vecTypes";
import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import { numberValidator } from "src/scripting/modules/auto/validators/basicValidators";
import {
  IceBlockConstructorArg,
  iceBlockConstructorValidator
} from "src/scripting/modules/auto/validators/iceValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

type IceExtraInfo = {
  mana: number;
};

@autoTranslateClass({
  constructorAsync: true,
  constructorValidator: iceBlockConstructorValidator
})
export class IceBlock extends EntityInfo<IceExtraInfo> {
  static type = "IceBlock";
  public type = IceBlock.type;

  protected opts?: IceBlockConstructorArg;

  constructor(opt?: IceBlockConstructorArg) {
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

    let shape: arr2[] | undefined;
    let holes: arr2[][] | undefined = undefined;
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
    if (opt?.holes) {
      holes = opt.holes
        ?.map((hole) =>
          hole?.map((v) => (Array.isArray(v) ? v : vector2ToArr2(v)))
        )
        .filter((hole): hole is arr2[] => !!hole);
    }

    await this.rpcs.castIceBlock({
      useHandleId: this.trackingId.persistentHandleId,
      casterId: opt?.spark?.id ?? undefined,
      shape,
      holes,
      angle: opt?.angle ?? 0
    });
  }

  /** RPC proxy onto the main-thread IceBlockNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Ice]: IceBlock is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).IceBlockNative;
  }

  @exposeProp()
  get mana() {
    return this.extra?.mana ?? 0;
  }

  @exposeProp({ validator: numberValidator, exposeErrorMessages: true })
  async storeMana(amount: number) {
    if (!this.id) return;
    await this.rpcs.feedIceBlock(this.id, amount);
  }

  @exposeProp()
  public async destroy() {
    if (this.id) await this.rpcs.destroyIceBlock(this.id);
  }
}
