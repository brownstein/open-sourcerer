import { createContext } from "react";

import { OverlayProviderAPI } from "src/api/overlay";

export const OverlayContext = createContext<OverlayProviderAPI | null>(null);
