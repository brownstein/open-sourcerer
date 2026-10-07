import { createTypedEventEmitter } from "src/api/util";

import * as API from "./SpellWorkerAPI";
import { SpellWorkerInternal } from "./SpellWorkerInternal";

const ctx: Worker = global.self as unknown as Worker;
const incomingEvents = createTypedEventEmitter<API.UnknownMessagePattern>();

const handler = new SpellWorkerInternal(incomingEvents, (msg: unknown) =>
  ctx.postMessage(msg)
);

ctx.addEventListener("message", (ev) =>
  incomingEvents.emit("message", ev.data)
);

// Tear everything down when an unhandled exception occurs.
ctx.addEventListener("error", () => handler.teardown());
