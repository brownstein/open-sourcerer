import * as yup from "yup";

export const validComponentNames = [
  "viewport",
  "stviewport",
  "skillDescription",
  "codeEditor",
  "console",
  "levelSelector",
  "debug",
  "inventory",
  "docs",
  "settings",
  "tutorials",
  "demoMode",
  "visualizer",
  "skillTree",
  "skillDetails",
  "codingChallenge",
  "componentDebug",
  "questLog",
  "levelEditor"
] as const;

export const validComponentNameSet = new Set<string>(validComponentNames);

export const componentNameValidator = yup
  .string()
  .required("componentName is required.")
  .oneOf(
    [...validComponentNames],
    ({ value }) =>
      `Unknown component "${value}". Valid names: ${validComponentNames.join(
        ", "
      )}`
  );
