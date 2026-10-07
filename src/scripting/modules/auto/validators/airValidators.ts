import * as yup from "yup";

import { iVector2Spec } from "./basicValidators";

export const nestedIdSpec = yup.object({
  entityId: yup.string().optional(),
  handleId: yup.string().optional()
});

export type NestedId = ReturnType<typeof nestedIdSpec.validateSync>;

export const targetIdSpec = yup.mixed((arg): arg is string | NestedId => {
  if (typeof arg === "string") return true;
  try {
    if (nestedIdSpec.validateSync(arg)) return true;
  } catch (err) {
    return false;
  }
  return false;
});

export const impulseOptSpec = yup.object({
  targetId: targetIdSpec,
  impulse: iVector2Spec.optional()
});

export const impulseOptValidator = (arg: unknown) =>
  impulseOptSpec.validateSync(arg);

export type ImpulseOpt = ReturnType<typeof impulseOptValidator>;
