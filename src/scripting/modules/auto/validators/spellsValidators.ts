import * as yup from "yup";

export const spellNameValidator = yup
  .string()
  .required("spell name is required.");

export const codeValidator = yup.string().required("code is required.");

export const listArgsValidator = yup.object({});

export const getArgsValidator = yup.object({
  name: spellNameValidator
});

export const setEditorArgsValidator = yup.object({
  code: codeValidator,
  tabId: yup.string().optional()
});

export const runCodeArgsValidator = yup.object({
  code: codeValidator
});

export const runSavedArgsValidator = yup.object({
  name: spellNameValidator
});

export const runEditorArgsValidator = yup.object({
  tabId: yup.string().optional()
});

export const saveArgsValidator = yup.object({
  name: spellNameValidator,
  code: codeValidator
});

export const stopArgsValidator = yup.object({
  contextId: yup.string().required("contextId is required.")
});
