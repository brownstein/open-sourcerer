import { generateRoomCode } from "src/components/level-editor/collab/collabTypes";

import { GameRoom, trysteroSelfId } from "../GameRoom";
import { LobbyDirectory } from "../LobbyDirectory";
import type { NetRoomAPI, NetTransportAPI } from "../transport";

/** The browser-default transport: Trystero rooms + the public directory
 *  room for discovery. */
export class TrysteroTransport implements NetTransportAPI {
  readonly kind = "trystero" as const;
  readonly selfId = trysteroSelfId;
  readonly discovery = new LobbyDirectory();

  createRoom(): Promise<NetRoomAPI> {
    return Promise.resolve(new GameRoom(generateRoomCode()));
  }

  joinRoom(ref: string): Promise<NetRoomAPI> {
    return Promise.resolve(new GameRoom(ref));
  }
}
