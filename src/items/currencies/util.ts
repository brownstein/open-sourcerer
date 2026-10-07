import { CurrencyOrder, CurrencyType, CurrencyValues } from "./Currency";

const leastToGreatestCurrency: CurrencyType[] = [];
for (const currencyType of CurrencyOrder) {
  leastToGreatestCurrency.push(currencyType);
}
leastToGreatestCurrency.sort((a, b) => CurrencyValues[b] - CurrencyValues[a]);

export function breakDownCurrencyIntoDenominations(amount: number): [CurrencyType, number][] {
  let remainingAmount = amount;
  const result: [CurrencyType, number][] = [];
  for (let i = leastToGreatestCurrency.length; i >= 0; i++) {
    const currencyType = leastToGreatestCurrency.at(i);
    if (!currencyType) continue;
    const currencyValue = CurrencyValues[currencyType];
    const amountOfDenomination = Math.floor(remainingAmount / currencyValue);
    const valueOfAmountOfDenomination = currencyValue * amountOfDenomination;
    remainingAmount -= valueOfAmountOfDenomination;
    if (amountOfDenomination > 0) result.push([currencyType, amountOfDenomination]);
  }
  return result;
}
