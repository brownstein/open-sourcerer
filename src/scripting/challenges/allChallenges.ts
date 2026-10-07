import { CodingChallenge } from "src/api/codingChallenge";
import { RegistryProvider } from "src/api/registry";
import { cConditionalsAndLoops } from "src/challenges/composed/ConditionalsAndLoops";
import { cHelloWorld } from "src/challenges/composed/HelloWorld";
import { cPing } from "src/challenges/composed/Ping";
import { cSparkNavigation } from "src/challenges/composed/SparkNavigation";
import { cVariables } from "src/challenges/composed/Variables";

const codingChallengesArr: CodingChallenge[] = [
  cHelloWorld,
  cVariables,
  cConditionalsAndLoops,
  cPing,
  cSparkNavigation
];

export class CodingChallengeRegistry
  implements RegistryProvider<CodingChallenge>
{
  private challenges = new Map<string, CodingChallenge>();
  constructor(challenges: CodingChallenge[]) {
    for (const codingChallenge of challenges)
      this.add(codingChallenge.id, codingChallenge);
  }
  keys() {
    return [...this.challenges.keys()];
  }
  add(key: string, obj: CodingChallenge) {
    this.challenges.set(key, obj);
  }
  get(key: string) {
    return this.challenges.get(key) ?? null;
  }
}

export const allCodingChallenges = new CodingChallengeRegistry(
  codingChallengesArr
);
