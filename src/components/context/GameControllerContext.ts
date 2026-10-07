import { createContext } from "react";

import { GameController } from "src/engine/controller/GameController";

export const GameControllerContext = createContext<GameController | null>(null);
