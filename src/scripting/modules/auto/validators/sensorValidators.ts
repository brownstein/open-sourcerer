import * as yup from "yup";

import { sparkArgSpec } from "./sparkValidators";

export const sensorConstructorSpec = yup
  .object({
    spark: sparkArgSpec.optional(),
    radius: yup.number().optional()
  })
  .optional();

export const sensorConstructorValidator = (opt: unknown) =>
  sensorConstructorSpec.validateSync(opt);

export type SensorConstructorArg = ReturnType<
  typeof sensorConstructorValidator
>;
