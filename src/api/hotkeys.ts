export enum HotKeys {
  HotKey1 = "HotKey1",
  HotKey2 = "HotKey2",
  HotKey3 = "HotKey3",
  HotKey4 = "HotKey4",
  HotKey5 = "HotKey5",
  HotKey6 = "HotKey6",
  HotKey7 = "HotKey7",
  HotKey8 = "HotKey8",
  HotKey9 = "HotKey9",
  HotKey0 = "HotKey0"
}

export const OrderedHotKeys = [
  HotKeys.HotKey1,
  HotKeys.HotKey2,
  HotKeys.HotKey3,
  HotKeys.HotKey4,
  HotKeys.HotKey5,
  // This next set are not currently in use.
  // HotKeys.HotKey6,
  // HotKeys.HotKey7,
  // HotKeys.HotKey8,
  // HotKeys.HotKey9,
  // HotKeys.HotKey0
];

export const HotKeyToDisplayName: Record<HotKeys, string> = {
  [HotKeys.HotKey1]: "1",
  [HotKeys.HotKey2]: "2",
  [HotKeys.HotKey3]: "3",
  [HotKeys.HotKey4]: "4",
  [HotKeys.HotKey5]: "5",
  [HotKeys.HotKey6]: "6",
  [HotKeys.HotKey7]: "7",
  [HotKeys.HotKey8]: "8",
  [HotKeys.HotKey9]: "9",
  [HotKeys.HotKey0]: "0"
};
