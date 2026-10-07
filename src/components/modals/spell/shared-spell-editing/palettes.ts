import { useMemo } from "react";

export const fireSpellPalette = [
  0xffa75e, 0xffdf87, 0xff9f0a, 0xff5a1f, 0xffd906
];
export const iceSpellPalette = [
  0x0acaff, 0xd5f7ff, 0x0a7cff, 0x0affe5, 0x77daff
];
export const miscSpellPalette = [0xe885ff, 0xffc085, 0xcdff85, 0xb1a69c];
export const emblemColorPalette = [0x000000, 0xffffff];

export function interleave<T>(...arrs: T[][]): T[] {
  let maxLen = 0;
  for (const arr of arrs) maxLen = Math.max(arr.length, maxLen);
  const result: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrs) {
      if (arr.length > i) result.push(arr[i]);
    }
  }
  return result;
}

export function useSpellColorPalette(spellImportSet: Set<string> | null) {
  return useMemo(() => {
    if (spellImportSet) {
      if (spellImportSet.has("fire")) {
        return [
          ...fireSpellPalette,
          ...interleave(iceSpellPalette, miscSpellPalette)
        ];
      }
      if (spellImportSet.has("ice")) {
        return [
          ...iceSpellPalette,
          ...interleave(fireSpellPalette, miscSpellPalette)
        ];
      }
    }
    return interleave(fireSpellPalette, iceSpellPalette, miscSpellPalette);
  }, [spellImportSet]);
}

export function useEmblemColorPalette(spellImportSet: Set<string> | null) {
  return useMemo(() => {
    if (spellImportSet) {
      if (spellImportSet.has("fire")) {
        return [
          ...emblemColorPalette,
          ...fireSpellPalette,
          ...interleave(iceSpellPalette, miscSpellPalette)
        ];
      }
      if (spellImportSet.has("ice")) {
        return [
          ...emblemColorPalette,
          ...iceSpellPalette,
          ...interleave(fireSpellPalette, miscSpellPalette)
        ];
      }
    }
    return [
      ...emblemColorPalette,
      ...interleave(fireSpellPalette, iceSpellPalette, miscSpellPalette)
    ];
  }, [spellImportSet]);
}
