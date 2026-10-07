import * as yup from "yup";

export const grappleConstructorValidator = yup.object({
  targetX: yup.number().required(),
  targetY: yup.number().required(),
  sourceEntityId: yup.string().nullable().default(null),
  targetEntityId: yup.string().nullable().default(null),
  length: yup.number().nullable().default(null),
  springiness: yup.number().min(0).max(1).nullable().default(null)
});

export type GrappleConstructorArg = ReturnType<
  typeof grappleConstructorValidator.validateSync
>;

export const castRayValidator = yup.object({
  directionX: yup.number().required(),
  directionY: yup.number().required(),
  maxDistance: yup.number().nullable().default(null)
});

export type CastRayArg = ReturnType<typeof castRayValidator.validateSync>;
