import * as yup from "yup";

export const sparkArgSpec = yup
  .object({
    _casterEntityId: yup.string().nullable(),
    id: yup.string().nullable()
  })
  .nullable()
  .default(null);

export const sparkConstructorSpec = yup.object({
  spark: sparkArgSpec,
  mana: yup.number().notRequired(),
  offset: yup
    .object({
      x: yup.number().default(0),
      y: yup.number().default(0)
    })
    .nullable()
    .default(null),
  cameraFollow: yup.boolean().notRequired().nonNullable()
});

export const sparkConstructorValidator = (opt: unknown) =>
  sparkConstructorSpec.validateSync(opt);

export type SparkConstructorArg = ReturnType<typeof sparkConstructorValidator>;

export const optionalNumberSpec = yup.number().notRequired().default(1);

export const optionalNumberValidator = (opt: unknown) =>
  optionalNumberSpec.validateSync(opt);
