import { JSRunnerCtx } from "src/scripting/core/api";
import {
  autoTranslateClass,
  exposeErrorMessage,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { SpellVector } from "src/scripting/modules/shared/spellVector";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

@exposeErrorMessage()
class ValidationError extends Error {
  public _isKnownError = true;
}

@autoTranslateClass({ name: "Shapes" })
export class SpellShapes {
  @exposeProp({ exposeErrorMessages: true })
  @markStaticCastableFunction()
  static rect(width: number, height: number) {
    if (typeof width !== "number") {
      throw new ValidationError("The first argument, width, must be a number.");
    }
    if (typeof height !== "number") {
      throw new ValidationError(
        "The second argument, height, must be a number."
      );
    }
    return [
      new SpellVector(-width * 0.5, -height * 0.5),
      new SpellVector(width * 0.5, -height * 0.5),
      new SpellVector(width * 0.5, height * 0.5),
      new SpellVector(-width * 0.5, height * 0.5)
    ];
  }

  @exposeProp({ exposeErrorMessages: true })
  @markStaticCastableFunction()
  static triangle(radius: number, angle = 0) {
    if (typeof radius !== "number") {
      throw new Error("The first argument, radius, must be a number.");
    }
    if (typeof angle !== "number") {
      throw new Error("The optional second argument, angle, must be a number.");
    }
    const shape: SpellVector[] = [];
    let currAngle = angle;
    for (let i = 0; i < 3; i++) {
      shape.push(
        new SpellVector(
          radius * Math.cos(currAngle),
          radius * Math.sin(currAngle)
        )
      );
      currAngle += (Math.PI * 2) / 3;
    }
    return shape;
  }

  @exposeProp({ exposeErrorMessages: true })
  @markStaticCastableFunction()
  static circle(radius: number, count = 32) {
    if (typeof radius !== "number") {
      throw new Error("The first argument, radius, must be a number.");
    }
    if (typeof count !== "number") {
      throw new Error("The optional second argument, count, must be a number.");
    }
    const shape: SpellVector[] = [];
    for (let i = 0; i < count; i++) {
      shape.push(
        new SpellVector(
          radius * Math.cos((i * Math.PI * 2) / count),
          radius * Math.sin((i * Math.PI * 2) / count)
        )
      );
    }
    return shape;
  }
}

export default {
  name: "shapes",
  manifest: {
    description: "Helpers that build polygon outlines (for earth/ice shapes).",
    export: {
      kind: "class",
      description: "Shape-builder functions returning Vector[] outlines.",
      properties: {},
      staticProperties: {
        rect: {
          kind: "function",
          params: [
            { name: "width", type: "number" },
            { name: "height", type: "number" }
          ],
          returns: "Vector[]"
        },
        triangle: {
          kind: "function",
          params: [
            { name: "radius", type: "number" },
            { name: "angle", type: "number", optional: true }
          ],
          returns: "Vector[]"
        },
        circle: {
          kind: "function",
          params: [
            { name: "radius", type: "number" },
            { name: "count", type: "number", optional: true }
          ],
          returns: "Vector[]"
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    return ctx.runner.translate.nativeToPseudo(SpellShapes);
  }
} satisfies SpellRuntimeModulePseudo;
