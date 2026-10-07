import * as yup from "yup";

export const numberSpec = yup.number();

export const numberValidator = (opt: unknown) => numberSpec.validateSync(opt);

export const iVector2Spec = yup.object({
  x: yup.number(),
  y: yup.number()
});

export const iVector2Validator = (opt: unknown) =>
  iVector2Spec.validateSync(opt);
