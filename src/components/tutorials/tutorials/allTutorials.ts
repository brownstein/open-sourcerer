import { RegistryProvider } from "src/api/registry";
import { Tutorial } from "src/api/tutorials";

import { T000AimSpell } from "./t000AimSpell";
import { T000_5SpellGravity } from "./t000_5SpellGravity";
import { T001CleanupUI } from "./t001CleanupUI";
import { T001RunHelloWorld } from "./t001RunHelloWorld";

const tutorialsArr = [
  T000AimSpell,
  T000_5SpellGravity,
  T001RunHelloWorld,
  T001CleanupUI
] as const satisfies Tutorial[];

export type TutorialId = (typeof tutorialsArr)[number]["id"];

export class TutorialsRegistry implements RegistryProvider<Tutorial> {
  private tutorials = new Map<string, Tutorial>();
  private orderedKeys: string[] = [];
  constructor(tutorialsArr: Tutorial[]) {
    for (const tutorial of tutorialsArr) {
      this.add(tutorial.id, tutorial);
      this.orderedKeys.push(tutorial.id);
    }
  }
  keys() {
    return [...this.tutorials.keys()];
  }
  keysOrdered() {
    return this.orderedKeys;
  }
  add(id: string, tutorial: Tutorial) {
    this.tutorials.set(id, tutorial);
  }
  get(id: string) {
    return this.tutorials.get(id) ?? null;
  }
}

export const allTutorials = new TutorialsRegistry(tutorialsArr);
