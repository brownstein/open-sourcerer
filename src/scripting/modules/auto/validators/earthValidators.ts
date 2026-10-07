import * as yup from "yup";

import { IVector2, arr2 } from "src/engine/util/vecTypes";

import { iVector2Validator } from "./basicValidators";
import { sparkArgSpec } from "./sparkValidators";

export const shapeSpec = yup.array(
  yup
    .mixed((input: unknown): input is IVector2 | arr2 => {
      if (typeof input !== "object") return false;
      if (Array.isArray(input)) return input.length === 2;
      return !!iVector2Validator(input);
    })
    .required()
    .typeError("Shape must be composed of { x, y } objects or [x, y] arrays.")
);

export const earthBlockConstructorSpec = yup.object({
  shape: shapeSpec.nullable().optional().default(null),
  holes: yup.array(shapeSpec.required().nonNullable()).nullable().optional(),
  rect: yup
    .object({
      width: yup.number().required(),
      height: yup.number().required()
    })
    .nullable()
    .optional()
    .default(null),
  circle: yup
    .object({
      radius: yup.number().required()
    })
    .nullable()
    .optional()
    .default(null),
  angle: yup.number().optional(),
  offset: yup
    .mixed((input: unknown): input is IVector2 | arr2 => {
      if (typeof input !== "object") return false;
      if (Array.isArray(input)) return input.length === 2;
      return !!iVector2Validator(input);
    })
    .optional()
    .nullable(),
  drawShape: yup.boolean().optional(),
  spark: sparkArgSpec
});

export const earthBlockConstructorValidator = (opt: unknown) =>
  earthBlockConstructorSpec.validateSync(opt);

export type EarthBlockConstructorArg = ReturnType<
  typeof earthBlockConstructorValidator
>;
