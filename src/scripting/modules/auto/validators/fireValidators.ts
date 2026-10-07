import * as yup from "yup";

// Constructor options for `new Fire({...})`.
export const fireballOptValidator = yup.object({
  velocity: yup
    .object({
      x: yup.number(),
      y: yup.number()
    })
    .nullable()
    .default(null)
    .strict(),
  at: yup
    .object({
      x: yup.number(),
      y: yup.number()
    })
    .nullable()
    .default(null)
    .strict(),
  strength: yup.number().nullable().default(null),
  gravity: yup.number().nullable().default(null),
  aim: yup.boolean().default(false),
  aimSpeed: yup.number().default(10),
  aimGuide: yup.boolean().nullable().default(null),
  spark: yup
    .object({
      id: yup.string()
    })
    .nullable()
    .default(null)
    .strict()
});

export type FireballPseudoConstructorArg = ReturnType<
  typeof fireballOptValidator.validateSync
>;

// Options for fireball.moveTo()/moveToAsync().
export const fireballOptMoveToValidator = yup.object({
  x: yup.number().nullable().default(null),
  y: yup.number().nullable().default(null),
  speed: yup.number().nullable().default(null)
});

export type FireballPseudoMoveToArg = ReturnType<
  typeof fireballOptMoveToValidator.validateSync
>;

// Args for Fire.blast(...).
export const fireblastArgsValidator = yup.object({
  aim: yup.boolean().default(false),
  angle: yup.number().nullable().optional(),
  spark: yup
    .object({
      id: yup.string()
    })
    .nullable()
    .default(null)
    .strict()
});

// Args for Fire.wave(...).
export const firewaveArgsValidator = yup.object({
  aim: yup.boolean().default(false),
  angles: yup.array().of(yup.number()).default([0]),
  spark: yup
    .object({
      id: yup.string()
    })
    .nullable()
    .default(null)
    .strict(),
  numBlasts: yup.number().default(10),
  spacing: yup.number().default(0.3),
  delayMs: yup.number().default(50)
});
