import { ElementalType } from "src/api/entity";

const palettes: Record<ElementalType, number[]> = {
  [ElementalType.Mana]: [0x2288ff, 0x44aaff],
  [ElementalType.Fire]: [0xffaa22, 0xff8811],
  [ElementalType.Earth]: [0xaa9966],
  [ElementalType.Electricity]: [0xffff44, 0xffffff],
  [ElementalType.Wind]: [0xaaccff],
  [ElementalType.Nature]: [0x44aa44, 0x66ff66],
  [ElementalType.Ice]: [0x44aaaa]
};

export function getEntityPalette(elementalType?: ElementalType, slots = 1): number[] {
  let palette = [0xffffff];
  if (elementalType !== undefined) {
    palette = palettes[elementalType];
  }
  const result: number[] = [];
  for (let i = 0; i < slots; i++) {
    const slotsIndex = i % palette.length;
    result.push(palette[slotsIndex]);
  }
  return result;
}
