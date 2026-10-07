// This is the human-maintainable wrapper for getting the auto-generated pseudo bindings.

import { JSRunnerAPI } from "../core/api";
import {
  AutoPseudoBindings,
  buildAutoPseudoBindings
} from "./autoPseudoBindings";

const kAutoPsuedoKey = "autoBoundRPCs";

export function getAutoPseudoRPCBindings(runner: JSRunnerAPI): AutoPseudoBindings {
  const extant = runner.ctx.ioc.mapping.get(kAutoPsuedoKey);
  if (extant) return extant as AutoPseudoBindings;
  const bindings = buildAutoPseudoBindings(runner);
  runner.ctx.ioc.mapping.set(kAutoPsuedoKey, bindings);
  return bindings;
}
