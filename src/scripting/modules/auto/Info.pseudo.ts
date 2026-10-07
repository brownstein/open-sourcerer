import { InterpreterObject, InterpreterPrimitive } from "js-interpreter";

import {
  PropertyBindingDataResult,
  getPropertyBindingData,
  isInstanceofMappedClazz,
  isMappedClazz
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { isPrimitiveValue } from "src/scripting/core/util";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "info",
  manifest: {
    description:
      "Inspects an imported module or entity, listing its available properties.",
    export: {
      kind: "function",
      description:
        "Returns a description of the target's properties/methods (for discovery).",
      params: [{ name: "target", type: "any" }],
      returns: "object"
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    async function info(target: InterpreterObject | InterpreterPrimitive) {
      if (isPrimitiveValue(target)) {
        return [target];
      }

      const results: Record<string, string> = {};

      const addPropBindingInfo = (
        key: string,
        propInfo: PropertyBindingDataResult
      ) => {
        if (propInfo.instanceValue) {
          results[key] = `${propInfo.instanceValue}`;
          return;
        }
        if (propInfo.prototypeBinding?.enumerable) {
          results[key] = `${typeof (target as Record<typeof key, unknown>)[
            key
          ]}`;
          return;
        }
      };

      const clazzSeen = new WeakSet();
      const addClazzAttributesToResults = (clazz: object) => {
        if (clazzSeen.has(clazz) || !isMappedClazz(clazz)) return;
        clazzSeen.add(clazz);
        for (const key of Object.keys(
          Object.getOwnPropertyDescriptors(clazz)
        )) {
          const propBindingInfo = getPropertyBindingData(runner, target, key);
          if (propBindingInfo) addPropBindingInfo(key, propBindingInfo);
        }
        for (const key of Object.keys(
          Object.getOwnPropertyDescriptors(clazz.prototype)
        )) {
          const propBindingInfo = getPropertyBindingData(runner, target, key);
          if (propBindingInfo) addPropBindingInfo(key, propBindingInfo);
        }
        addClazzAttributesToResults(clazz.prototype.constructor);
      };

      if (isMappedClazz(target)) {
        results.name = target.name;
        addClazzAttributesToResults(target);
        return results;
      }

      if (isInstanceofMappedClazz(target)) {
        results.className = `${target.constructor?.name ?? "Object"}`;
        for (const key of Object.keys(
          Object.getOwnPropertyDescriptors(target)
        )) {
          const propBindingInfo = getPropertyBindingData(runner, target, key);
          if (propBindingInfo) addPropBindingInfo(key, propBindingInfo);
        }
        if (target.constructor) addClazzAttributesToResults(target.constructor);
      }

      return results;
    }
    return runner.translate.nativeToPseudo(info);
  }
} satisfies SpellRuntimeModulePseudo;
