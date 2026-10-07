import { ReactNode } from "react";

export type Celebration = {
  type: "progression" | "codingChallenge" | "tutorial" | "achievement";
  icon?: string;
  content?: ReactNode;
};