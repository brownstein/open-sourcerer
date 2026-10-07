import * as yup from "yup";

import { DamageType, ElementalType } from "src/api/entity";

const colorComponentValidator = yup.object({
  r: yup.number().default(1),
  g: yup.number().default(1),
  b: yup.number().default(1)
});

// Constructor options for `new Projectile({...})`.
export const projectileOptValidator = yup.object({
  velocity: yup
    .object({
      x: yup.number(),
      y: yup.number()
    })
    .nullable()
    .default(null)
    .strict(),
  strength: yup.number().nullable().default(null),
  aim: yup.boolean().default(false),
  aimSpeed: yup.number().default(15),
  aimGuide: yup.boolean().nullable().default(null),
  directPath: yup.boolean().nullable().default(null),
  colorInner: colorComponentValidator.nullable().default(null),
  colorOuter: colorComponentValidator.nullable().default(null),
  colorTrail: colorComponentValidator.nullable().default(null),
  opacityInner: yup.number().nullable().default(null),
  opacityOuter: yup.number().nullable().default(null),
  radius: yup.number().nullable().default(null),
  gravity: yup.number().nullable().default(1),
  enableParticles: yup.boolean().nullable().default(null),
  particleColor: colorComponentValidator.nullable().default(null),
  elementalType: yup
    .string()
    .oneOf(Object.values(ElementalType))
    .nullable()
    .default(null),
  damageType: yup
    .string()
    .oneOf(Object.values(DamageType))
    .nullable()
    .default(null),
  trailMaxLength: yup.number().nullable().default(null),
  trailLengthMs: yup.number().nullable().default(null),
  spark: yup
    .object({
      id: yup.string()
    })
    .nullable()
    .default(null)
    .strict()
});

export type ProjectilePseudoConstructorArg = ReturnType<
  typeof projectileOptValidator.validateSync
>;

// Options for projectile.moveTo()/moveToAsync().
export const projectileOptMoveToValidator = yup.object({
  x: yup.number().nullable().default(null),
  y: yup.number().nullable().default(null),
  speed: yup.number().nullable().default(null)
});

export type ProjectilePseudoMoveToArg = ReturnType<
  typeof projectileOptMoveToValidator.validateSync
>;
