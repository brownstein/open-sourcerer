import * as yup from "yup";

import { IVector2, arr2 } from "src/engine/util/vecTypes";

import { iVector2Validator } from "./basicValidators";

const shapeSpec = yup.array(
  yup
    .mixed((input: unknown): input is IVector2 | arr2 => {
      if (typeof input !== "object") return false;
      if (Array.isArray(input)) return input.length === 2;
      return !!iVector2Validator(input);
    })
    .required()
    .typeError("Polygon must be composed of { x, y } objects or [x, y] arrays.")
);

const colorSpec = yup
  .object({
    r: yup.number().required(),
    g: yup.number().required(),
    b: yup.number().required()
  })
  .nullable()
  .optional()
  .default(null);

export const areaPreviewConstructorSpec = yup.object({
  polygon: shapeSpec.required(),
  attachToEntityId: yup.string().nullable().optional(),
  color: colorSpec
});

export const areaPreviewConstructorValidator = (opt: unknown) =>
  areaPreviewConstructorSpec.validateSync(opt);

export type AreaPreviewConstructorArg = ReturnType<
  typeof areaPreviewConstructorValidator
>;
