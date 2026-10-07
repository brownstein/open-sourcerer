import { SteamTransport } from "./steam/SteamTransport";
import {
  getSteamNetBridge,
  registerTransportFactory
} from "./transport";
import { TrysteroTransport } from "./trystero/TrysteroTransport";

// Registers the transport factory at module load. Imported for its side
// effect by MultiplayerSession (the first networking consumer), keeping
// transport.ts itself free of adapter imports so adapters can import its
// types without a cycle.
registerTransportFactory(() => {
  const bridge = getSteamNetBridge();
  return bridge ? new SteamTransport(bridge) : new TrysteroTransport();
});
