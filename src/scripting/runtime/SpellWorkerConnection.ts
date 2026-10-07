import {
  MessageFromWorker,
  MessageToWorker,
  isMessageFromWorker
} from "./SpellWorkerAPI";
import { SpellWorkerConnectionAPI } from "./SpellWorkerConnectionAPI";

export class SpellWorkerConnection implements SpellWorkerConnectionAPI {
  private worker?: Worker;
  setup(handler: (msg: MessageFromWorker) => void): SpellWorkerConnectionAPI {
    this.worker = new Worker(
      new URL("./SpellWorkerConnection.worker", import.meta.url),
      {
        name: "SpellWorker"
      }
    );
    this.worker.onmessage = (ev: MessageEvent<unknown>) => {
      const msg = ev.data;
      if (isMessageFromWorker(msg)) {
        handler(msg);
      } else {
        console.error(
          "[SpellWorkerConnection]: Protocol error - message does not conform to API:",
          msg
        );
      }
    };
    return this;
  }
  teardown(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
  send(msg: MessageToWorker): void {
    this.worker?.postMessage(msg);
  }
}
