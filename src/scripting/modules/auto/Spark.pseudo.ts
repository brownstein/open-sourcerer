import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { ManaSpark } from "src/scripting/entites/definitions/ManaSpark";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "spark",
  // require()-autocomplete metadata. Picked up by the build script
  // (generate-auto-module-bindings) and merged into SPELL_API_MANIFESTS so
  // `require("spark")` shows up in spell completion. It lives here on the
  // pseudo definition because it describes the require()-able surface (the
  // ManaSpark pseudo class), not the native RPC handler. Must be a
  // self-contained literal — it is inlined verbatim into the generated
  // manifest file.
  manifest: {
    description: "ManaSpark — a floating orb that casts spells.",
    export: {
      kind: "class",
      description:
        "Creates a ManaSpark entity that orbits the caster and can cast spells from its position.",
      constructorParams: [
        {
          name: "opts",
          type: "{ mana?: number, offset?: { x: number, y: number }, cameraFollow?: boolean, casterId?: string }",
          optional: true
        }
      ],
      constructorOpts: {
        mana: {
          kind: "value",
          valueType: "number",
          description: "Initial mana to transfer into the spark"
        },
        offset: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Position offset relative to the caster"
        },
        cameraFollow: {
          kind: "value",
          valueType: "boolean",
          description: "Should the camera follow this spark?"
        },
        casterId: {
          kind: "value",
          valueType: "string",
          description: "ID of the entity to cast from (defaults to the caster)"
        }
      },
      properties: {
        id: {
          kind: "value",
          valueType: "string",
          description: "Persistent handle ID"
        },
        type: {
          kind: "value",
          valueType: "string",
          description: "Entity type string ('ManaSpark')"
        },
        mana: {
          kind: "value",
          valueType: "number",
          description: "Current mana held by the spark"
        },
        cast: {
          kind: "function",
          description:
            "Casts a spell or constructs a class from this spark's position.",
          params: [
            { name: "spell", type: "class | function" },
            { name: "arg", type: "object", optional: true }
          ]
        },
        castAsync: {
          kind: "function",
          description: "Async/promise variant of cast().",
          params: [
            { name: "spell", type: "class | function" },
            { name: "arg", type: "object", optional: true }
          ]
        },
        destroy: {
          kind: "function",
          description: "Destroys this spark.",
          returns: "void"
        },
        setOffset: {
          kind: "function",
          description:
            "Updates the spark's orbit offset relative to the caster.",
          params: [{ name: "offset", type: "{ x: number, y: number }" }]
        },
        setPosition: {
          kind: "function",
          description: "Teleports the spark toward an absolute position.",
          params: [{ name: "position", type: "{ x: number, y: number }" }]
        },
        returnToCaster: {
          kind: "function",
          description:
            "Streams the spark's mana back to the caster and destroys it.",
          returns: "void"
        },
        storeMana: {
          kind: "function",
          description: "Transfers mana from the caster into this spark.",
          params: [{ name: "amount", type: "number" }]
        },
        leech: {
          kind: "function",
          description:
            "Drains a nearby ManaFountain (within range, line of sight) to refill the spark.",
          params: [{ name: "fountainHandleId", type: "string" }]
        },
        passMana: {
          kind: "function",
          description: "Streams mana from this spark to another spark.",
          params: [
            { name: "targetSpark", type: "ManaSpark" },
            { name: "amount", type: "number" }
          ]
        },
        moveRight: {
          kind: "function",
          description: "Moves the spark right by n tiles (default 1).",
          params: [{ name: "n", type: "number", optional: true }]
        },
        moveLeft: {
          kind: "function",
          description: "Moves the spark left by n tiles (default 1).",
          params: [{ name: "n", type: "number", optional: true }]
        },
        moveUp: {
          kind: "function",
          description: "Moves the spark up by n tiles (default 1).",
          params: [{ name: "n", type: "number", optional: true }]
        },
        moveDown: {
          kind: "function",
          description: "Moves the spark down by n tiles (default 1).",
          params: [{ name: "n", type: "number", optional: true }]
        }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(ManaSpark);
  }
} satisfies SpellRuntimeModulePseudo;
