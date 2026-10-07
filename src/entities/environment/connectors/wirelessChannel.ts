// Internal namespace for wireless channel keys within level state, so
// designer-facing channel names can never collide with keys written by
// level scripts or other entities.
const kWirelessChannelKeyPrefix = "IOWireless::";

export function wirelessChannelKey(name: string) {
  return kWirelessChannelKeyPrefix + name;
}
