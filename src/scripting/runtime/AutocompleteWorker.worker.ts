import { computeAutocomplete } from "src/scripting/core/autocomplete";

type RequestMessage = {
  id: string;
  code: string;
  row: number;
  col: number;
};

const ctx: Worker = global.self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<RequestMessage>) => {
  const { id, code, row, col } = e.data;
  try {
    const results = computeAutocomplete(code, row, col);
    ctx.postMessage({ id, results });
  } catch {
    ctx.postMessage({ id, results: [] });
  }
};
