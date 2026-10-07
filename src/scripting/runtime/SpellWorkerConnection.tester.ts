import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";

import * as API from "./SpellWorkerAPI";
import { SpellWorkerConnectionAPI } from "./SpellWorkerConnectionAPI";
import { SpellWorkerInternal } from "./SpellWorkerInternal";

export class SpellWorkerConnection implements SpellWorkerConnectionAPI {
  private handlerEE?: TypedEventEmitter<API.UnknownMessagePattern>;
  setup(
    handler: (msg: API.MessageFromWorker) => void
  ): SpellWorkerConnectionAPI {
    this.handlerEE = createTypedEventEmitter<API.UnknownMessagePattern>();
    new SpellWorkerInternal(this.handlerEE, handler);
    return this;
  }
  teardown(): void {
    this.handlerEE = undefined;
  }
  send(msg: API.MessageToWorker): void {
    this.handlerEE?.emit("message", msg);
  }
}
