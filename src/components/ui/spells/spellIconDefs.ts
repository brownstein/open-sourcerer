import aimUrl from "./icons/Aim.png";
import airUrl from "./icons/Air.png";
import delayUrl from "./icons/Delay.png";
import earthSpikeUrl from "./icons/EarthSpike.png";
import fireballUrl from "./icons/Fireball.png";
import fireblastUrl from "./icons/Fireblast.png";
import grappleUrl from "./icons/Grapple.png";
import healingUrl from "./icons/Healing.png";
import iceBoltUrl from "./icons/IceBolt.png";
import iceBlockUrl from "./icons/IceBlock.png";
import lightningUrl from "./icons/Lightning.png";
import pingUrl from "./icons/Ping.png";
import terminalFillUrl from "./icons/TerminalFill.png";

export type SpellIconIconDef = {
  iconKey: string;
  url: string;
  name: string;
};

export const spellIconDefs: SpellIconIconDef[] = [
  { iconKey: "fireball", url: fireballUrl, name: "Fireball" },
  { iconKey: "fireblast", url: fireblastUrl, name: "Fireblast" },
  { iconKey: "iceBolt", url: iceBoltUrl, name: "Ice Bolt" },
  { iconKey: "iceBlock", url: iceBlockUrl, name: "Ice Block" },
  { iconKey: "lightning", url: lightningUrl, name: "Lightning" },
  { iconKey: "earthSpike", url: earthSpikeUrl, name: "Earth Spike" },
  { iconKey: "air", url: airUrl, name: "Air" },
  { iconKey: "aim", url: aimUrl, name: "Aim" },
  { iconKey: "ping", url: pingUrl, name: "Ping" },
  { iconKey: "healing", url: healingUrl, name: "Healing" },
  { iconKey: "grapple", url: grappleUrl, name: "Grapple" },
  { iconKey: "delay", url: delayUrl, name: "Delay" },
  { iconKey: "terminal", url: terminalFillUrl, name: "Terminal" }
];

const iconDefsByKey = new Map(spellIconDefs.map((d) => [d.iconKey, d]));

export function getIconDefByKey(key: string): SpellIconIconDef | undefined {
  return iconDefsByKey.get(key);
}
