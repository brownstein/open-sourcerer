import { useAppSelector } from "src/redux/hooks";

import { selectMultiplayerFlow } from "../../match/selectors";
import { LobbyScreen } from "./LobbyScreen";
import { MultiplayerMenu } from "./MultiplayerMenu";
import "./MultiplayerScreens.less";

/**
 * The title-side multiplayer screens (menu ↔ lobby). Rendered by
 * MainEntryPoint while on the title screen with the multiplayer flow open;
 * the in-match and results states render inside the game viewport instead.
 */
export function MultiplayerScreens() {
  const flow = useAppSelector(selectMultiplayerFlow);
  if (flow === "lobby") return <LobbyScreen />;
  return <MultiplayerMenu />;
}
