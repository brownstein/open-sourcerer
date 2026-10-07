import * as yup from "yup";

/////////////
// NestedId
/////////////

export const nestedIdSpec = yup.object({
  entityId: yup.string().optional(),
  handleId: yup.string().optional()
});

export type NestedId = ReturnType<typeof nestedIdSpec.validateSync>;

////////////////////////////////////
//Common targetId and strength specs
////////////////////////////////////

export const targetIdSpec = yup.mixed((arg): arg is string | NestedId => {
  if (typeof arg === "string") return true;
  try {
    if (nestedIdSpec.validateSync(arg)) return true;
  } catch (err) {
    return false;
  }
  return false;
});

export const strengthSpec = yup.mixed((arg): arg is number => {
  if (typeof arg === "number") return true;
  return false;
});

//////////////////
//Heal Constructor
//////////////////

export const healConstructorSpec = yup.object({
  targetId: targetIdSpec,
  strength: yup.number().optional(),
  isOverTime: yup.boolean().optional()
});

export const healConstructorValidator = (opt: unknown) =>
  healConstructorSpec.validateSync(opt);

export type HealConstructorArg = ReturnType<typeof healConstructorValidator>;

/////////////////////
//Optional Heal specs
/////////////////////

export const healOptSpec = yup.object({
  targetId: targetIdSpec,
  strength: yup.number().optional().default(50)
});

export const healOptValidator = (arg: unknown) => healOptSpec.validateSync(arg);

export type HealOpt = ReturnType<typeof healOptValidator>;

////////////////////
//Instant Heal Spell
////////////////////

export const healInstantValidator = yup.object({
  targetId: targetIdSpec,
  strength: yup.number().optional()
});

export type HealInstantArg = ReturnType<
  typeof healInstantValidator.validateSync
>;

//////////////////////
//Over Time Heal Spell
//////////////////////

export const healOverTimeValidator = yup.object({
  targetId: targetIdSpec,
  strength: yup.number().optional()
});
export type HealOverTimeArg = ReturnType<
  typeof healOverTimeValidator.validateSync
>;
