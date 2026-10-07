import { ValueCompletion } from "src/api/spells";

type ResponseMessage = {
  id: string;
  results: ValueCompletion[];
};

/**
 * Manages the lifecycle of the dedicated autocomplete web worker.
 * The worker runs Babel parsing and manifest lookups off the main thread,
 * keeping autocomplete requests from competing with spell execution (which
 * runs in a separate spell worker) or the game's render loop.
 */
export class AutocompleteWorkerConnection {
  private worker: Worker;
  private pending = new Map<string, (results: ValueCompletion[]) => void>();
  private _idCounter = 0;

  constructor() {
    this.worker = new Worker(
      new URL("./AutocompleteWorker.worker", import.meta.url),
      { name: "AutocompleteWorker" }
    );
    this.worker.onmessage = (e: MessageEvent<ResponseMessage>) => {
      const { id, results } = e.data;
      const resolve = this.pending.get(id);
      if (resolve) {
        this.pending.delete(id);
        resolve(results);
      }
    };
    this.worker.onerror = (err) => {
      console.warn("[AutocompleteWorker] error:", err);
      // Resolve all pending requests with empty results so their Promises
      // don't hang forever if the worker crashes.
      for (const resolve of this.pending.values()) resolve([]);
      this.pending.clear();
    };
  }

  compute(
    code: string,
    row: number,
    col: number
  ): Promise<ValueCompletion[]> {
    const id = String(++this._idCounter);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, code, row, col });
    });
  }

  dispose() {
    this.worker.terminate();
    // Resolve pending Promises with empty results rather than leaving them
    // dangling — otherwise each in-flight request leaks a Promise + closure.
    for (const resolve of this.pending.values()) resolve([]);
    this.pending.clear();
  }
}
