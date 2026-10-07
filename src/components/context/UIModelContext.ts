import { Model } from "flexlayout-react";
import { createContext } from "react";

export const UIModelContext = createContext<Model | null>(null);
