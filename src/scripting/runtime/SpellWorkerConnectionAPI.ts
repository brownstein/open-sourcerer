import * as API from "./SpellWorkerAPI";

export type SpellWorkerConnectionAPI = {
  setup(
    handler: (msg: API.MessageFromWorker) => void
  ): SpellWorkerConnectionAPI;
  teardown(): void;
  send(msg: API.MessageToWorker): void;
};
