# Operators & Expressions

Mastering operators and expressions is essential for building dynamic spell calculations, conditional logic, and complex spell behaviors. This guide covers arithmetic, comparison, logical, and assignment operators you'll use throughout **Open Sourcerer**, with practical examples tailored to spell-casting scenarios.

---

## Overview

| Operator Type | Example | Use Case in Spells |
| --- | --- | --- |
| [Arithmetic](#Arithmetic%20Operators:%20Calculations%20and%20Math) | `damage * 1.5` | Calculate spell damage, mana costs, cooldowns |
| [Comparison](#Comparison%20Operators:%20Conditions%20and%20Validation) | `mana >= manaCost` | Check if spell can be cast, validate conditions |
| [Logical](#Logical%20Operators:%20Combining%20Conditions) | `isEmpowered && hasTarget` | Combine conditions for spell behavior |
| [Assignment](#Assignment%20Operators:%20Updating%20Values) | `comboCount += 1` | Update spell state, track counters |
| [Ternary](#Ternary%20Operator:%20Conditional%20Values) | `damage > 50 ? "high" : "low"` | Conditional spell effects, dynamic values |
| [Unary](#Unary%20Operators:%20Single-Value%20Operations) | `!isOnCooldown` | Negate conditions, increment/decrement |

Understanding operator precedence and behavior prevents calculation errors that could break spell logic or cause unexpected damage values.

---

## Beginner Vocabulary (Quick Reference)

- Operator: A symbol or keyword that does something with values (e.g., `+`, `-`, `*`, `&&`).
- Operand: The value an operator acts on (in `5 + 3`, the operands are `5` and `3`).
- Expression: A piece of code that produces a value (`2 + 2`, `mana >= manaCost`).
- Statement: A complete instruction (often ends with `;`), like `let x = 3;` or `if (...) { ... }`.
- Precedence: Which operators run first in a mixed expression (multiplication before addition).
- Associativity: The order operators of the same precedence are evaluated (often left-to-right).
- Short-circuit: `&&` and `||` can stop early—right side may never run.
- Side effect: When code changes something (like updating a variable) in addition to returning a value.
- Truthy/falsy: Values that behave like `true`/`false` in conditions (e.g., `0`, `""` are falsy).
- Type coercion: JavaScript automatically converting a value to another type (e.g., `"15"` to `15`).

Tip: When in doubt, add parentheses to make evaluation order explicit and logs to see intermediate values.

---

## Arithmetic Operators: Calculations and Math

**What it is:**
Mathematical operators that perform calculations on numeric values, essential for spell damage, mana costs, and coordinate calculations.

**Why it matters:**
Spell damage scaling, mana cost calculations, and positional math all rely on precise arithmetic operations. Understanding these operators ensures accurate spell behavior.

**How to use:**
Arithmetic operators combine numbers to produce new numbers. Use `+`, `-`, `*`, `/` for the basics; `%` gives the remainder (useful for turn cycles). Use `Math.pow(a,b)` for exponentiation and `Math.sqrt(x)` for square roots.

```js
// Arithmetic A: basics and modulo
var baseDamage = 30;
var manaCost = 15;
var multiplier = 1.5;
var castCount = 2;

var totalDamage = baseDamage * multiplier;
var manaAfterCast = 100 - manaCost;
var averageDamage = (baseDamage + totalDamage) / 2;

var cyclePosition = castCount % 4; // 0..3
var isEvenCycle = castCount % 2 === 0;

console.log({
  totalDamage: totalDamage,
  manaAfterCast: manaAfterCast,
  averageDamage: averageDamage,
  cyclePosition: cyclePosition,
  isEvenCycle: isEvenCycle
});
```

```js
// Arithmetic B: scaling and geometry
var baseDamage = 30;
var multiplier = 1.5;
var totalDamage = baseDamage * multiplier;

var empoweredDamage = Math.pow(baseDamage, 1.3);
var areaRadius = Math.sqrt(totalDamage / Math.PI);

console.log({
  empoweredDamage: empoweredDamage,
  areaRadius: areaRadius.toFixed(2)
});
```

**Common Mistakes:**
- Division by zero returns `Infinity`—always check denominators before dividing
- Floating-point precision issues: `0.1 + 0.2 !== 0.3`—use `Math.round()` for comparisons
- Operator precedence can cause unexpected results—use parentheses for clarity

Key terms:
- Modulo (`%`): remainder after division; `7 % 4` is `3`.
- Floating point: decimal math may have tiny rounding errors—round before comparing.
- Precedence: `*` and `/` happen before `+` and `-` unless you add parentheses.

---

## Comparison Operators: Conditions and Validation

**What it is:**
Operators that compare values and return boolean results, essential for spell conditions, validation, and branching logic.

**Why it matters:**
Spell casting conditions, damage thresholds, and validation logic all depend on accurate comparisons. Proper comparison prevents spells from executing when they shouldn't.

**How to use:**
Use comparison operators to ask yes/no questions about values. Prefer strict equality `===` and inequality `!==` to avoid surprise conversions. When comparing objects/arrays, remember comparisons check identity (same reference), not content.

```js
// Comparison A: equality and ranges
var currentMana = 45;
var spellCost = 20;
var targetHealth = 75;
var maxHealth = 100;
var distance = 10;
var spellDamage = 60;
var element = "fire";

var canAffordSpell = currentMana >= spellCost;
var isFullHealth = targetHealth === maxHealth;
var isLowHealth = targetHealth < 25;
var isHighDamage = spellDamage > 50;
var isMediumRange = distance >= 5 && distance <= 15;

console.log({
  canAffordSpell: canAffordSpell,
  isFullHealth: isFullHealth,
  isLowHealth: isLowHealth,
  isHighDamage: isHighDamage,
  isMediumRange: isMediumRange
});
```

```js
// Comparison B: type-safe and combined conditions
var element = "fire";
var spellDamage = 60;
var isOnCooldown = false;
var empowered = false;
var currentMana = 45;
var spellCost = 20;

var isValidElement = element === "fire" || element === "ice";
var isNotString = typeof spellDamage !== "string";
var canAffordSpell = currentMana >= spellCost;

var shouldUseCombo = (spellDamage > 50) && !isOnCooldown;
var shouldCastHeal = (false) && canAffordSpell; // illustrative

console.log({
  isValidElement: isValidElement,
  isNotString: isNotString,
  shouldUseCombo: shouldUseCombo,
  shouldCastHeal: shouldCastHeal
});
```

**Common Mistakes:**
- Using `==` instead of `===` can cause type coercion issues—always use strict equality
- Comparing `null` and `undefined` with `==` returns `true`—use `===` for precise checks
- Floating-point comparisons can fail—use `Math.abs(a - b) < 0.001` for approximate equality

Key terms:
- Strict equality (`===`): compares value and type (no conversions).
- Loose equality (`==`): may coerce types—avoid in new code.
- Range checks: combine `<, <=, >, >=` with `&&` to create intervals.

---

## Logical Operators: Combining Conditions

**What it is:**
Operators that combine boolean values and conditions to create complex spell logic and decision trees.

**Why it matters:**
Spell behavior often depends on multiple conditions being true or false simultaneously. Logical operators enable sophisticated spell mechanics and branching logic.

**How to use:**
Combine conditions with `&&` (AND) and `||` (OR). Remember short-circuiting: with `A && B`, if `A` is falsy, `B` is not evaluated; with `A || B`, if `A` is truthy, `B` is not evaluated. Use `!` to negate a condition.

```js
// Logical A: AND / OR / NOT
var isEmpowered = true;
var hasTarget = false;
var manaSufficient = true;
var isOnCooldown = false;
var health = 30;
var mana = 15;
var hasManaPotion = true;

var canCastEmpowered = isEmpowered && hasTarget && manaSufficient;
var canCastBasic = hasTarget && manaSufficient && !isOnCooldown;
var canCastAnySpell = canCastEmpowered || canCastBasic;
var isInDanger = health < 25 || mana < 10;
var isNotEmpowered = !isEmpowered;
var canCastNow = !isOnCooldown;

console.log({
  canCastEmpowered: canCastEmpowered,
  canCastBasic: canCastBasic,
  canCastAnySpell: canCastAnySpell,
  isInDanger: isInDanger,
  isNotEmpowered: isNotEmpowered,
  canCastNow: canCastNow
});
```

```js
// Logical B: short-circuit and complex expressions
function calculateDamage() { return 25; }
var hasTarget = true;
var target = {health: 50, name: "Goblin"};
var isEmpowered = true;
var manaSufficient = true;
var isOnCooldown = false;
var health = 18;
var mana = 12;
var hasManaPotion = false;

var shouldUseUltimate = isEmpowered && hasTarget && manaSufficient && !isOnCooldown;
var shouldRetreat = health < 20 || (mana < 15 && !hasManaPotion);
var safeDamage = hasTarget && target && target.health > 0 ? calculateDamage() : 0;

console.log({
  shouldUseUltimate: shouldUseUltimate,
  shouldRetreat: shouldRetreat,
  safeDamage: safeDamage
});
```

**Common Mistakes:**
- Logical operators return the last evaluated value, not always `true`/`false`—be explicit with comparisons
- Short-circuit evaluation can cause side effects—ensure functions in conditions are safe to call
- Complex expressions can be hard to read—break them into smaller, named variables

Key terms:
- Short-circuit: the right side may not run.
- Truthy/falsy: many non-boolean values behave like true/false.

---

## Assignment Operators: Updating Values

**What it is:**
Operators that assign values to variables and can perform calculations during assignment, essential for updating spell state and counters.

**Why it matters:**
Spell state management, combo counters, and resource tracking all require updating variables efficiently. Assignment operators provide concise ways to modify values.

**How to use:**
Use `=` to assign, and compound forms like `+=`, `-=`, `*=`, `/=` to update in place. Prefer clear, small updates over chaining many operations in one line.

```js
// Assignment A: basics and compound updates
var comboCount = 0;
var mana = 100;
var damage = 25;
var castCount = 0;
var manaRegen = 10;
var currentTarget = "enemy_goblin";
var spellElement = "fire";

comboCount += 1;
mana -= 15;
damage *= 1.2;
castCount++;

console.log({
  comboCount: comboCount,
  mana: mana,
  damage: damage,
  castCount: castCount
});
```

```js
// Assignment B: advanced compound and multiple vars
var comboCount = 3;
var mana = 50;
var damage = 40;
var manaRegen = 10;
var x = 0, y = 0, z = 0;
var element1 = "fire", element2 = "ice";

mana += manaRegen * 0.1;
damage /= 2;
comboCount %= 5;

console.log({
  comboCount: comboCount,
  mana: mana,
  damage: damage,
  x: x, y: y, z: z,
  element1: element1, element2: element2
});
```

**Common Mistakes:**
- `++` and `--` operators have different behavior before/after the variable—understand prefix vs postfix
- Compound assignment operators don't work with `const` variables—use `let` for mutable values
- Destructuring assignment requires matching structure—ensure object properties exist

Key terms:
- Assignment: store a value in a variable.
- Compound assignment: update and assign in one step.

---

## Ternary Operator: Conditional Values

**What it is:**
A concise operator that returns one of two values based on a condition, perfect for dynamic spell effects and conditional assignments.

**Why it matters:**
Ternary operators provide clean, readable conditional logic for spell effects, damage calculations, and dynamic behavior without verbose if-else statements.

**How to use:**
Ternary is a compact `if/else` that returns a value: `condition ? valueIfTrue : valueIfFalse`. Use it when both options are short; prefer `if/else` for multi-step logic.

```js
// Ternary A: basic and nested
var mana = 45;
var isEmpowered = true;
var targetHealth = 20;

var spellType = mana >= 50 ? "ultimate" : "basic";
var damageMultiplier = isEmpowered ? 1.5 : 1.0;
var targetStatus = targetHealth < 25 ? "critical" : "healthy";

var spellChoice = mana >= 80 ? "meteor" :
                   mana >= 50 ? "fireball" : 
                   mana >= 20 ? "ember" : "wait";

console.log({
  spellType: spellType,
  damageMultiplier: damageMultiplier,
  targetStatus: targetStatus,
  spellChoice: spellChoice
});
```

```js
// Ternary B: functions and defaults
var baseDamage = 30;
var isEmpowered = true;
var distance = 8;
var userElement = "fire";
var spellRadius = 0;
var customCooldown = null;
var manaCost = 15;

function calculateEmpoweredDamage() { return Math.round(baseDamage * 1.5); }
function calculateBasicDamage() { return baseDamage; }

var damage = isEmpowered ? calculateEmpoweredDamage() : calculateBasicDamage();
var effect = distance > 10 ? "ranged" : "melee";
var element = userElement || "fire";
var radius = spellRadius ? spellRadius : 2;
var cooldown = customCooldown ? customCooldown : 1000;

console.log({
  damage: damage,
  effect: effect,
  element: element,
  radius: radius,
  cooldown: cooldown
});
```

```js
// Ternary C: config building
var baseDamage = 30;
var isEmpowered = false;
var manaCost = 15;
var distance = 3;
var targetHealth = 40;

var spellConfig = {
  damage: isEmpowered ? baseDamage * 1.5 : baseDamage,
  radius: distance > 5 ? 3 : 1,
  element: targetHealth < 25 ? "fire" : "ice",
  manaCost: isEmpowered ? manaCost * 1.2 : manaCost
};

console.log("spellConfig:", spellConfig);
```

**Common Mistakes:**
- Nested ternary operators can become unreadable—consider using if-else statements for complex logic
- Ternary operators always evaluate both branches—avoid side effects in the false branch
- Missing parentheses can cause precedence issues—use them for clarity in complex expressions

Key terms:
- Conditional operator: another name for ternary.
- Expression vs statement: ternary is an expression (produces a value) you can assign.

---

## Unary Operators: Single-Value Operations

**What it is:**
Operators that work on a single value, including increment/decrement, type checking, and negation operations.

**Why it matters:**
Unary operators provide efficient ways to modify counters, check types, and negate conditions in spell logic.

**How to use:**
Unary operators operate on a single value. `++` and `--` have prefix and postfix forms; prefer using them on their own lines to avoid confusion. Use `typeof` for type checks and unary `+` to convert strings to numbers (`+"15"` → `15`).

```js
// Unary A: increment/decrement and NOT
var castCount = 0;
var mana = 100;
var isActive = true;

castCount++;        // Post-increment
++castCount;        // Pre-increment
mana--;             // Post-decrement
--mana;             // Pre-decrement

isActive = !isActive;
var isOnCooldown = false;
var isNotOnCooldown = !isOnCooldown;
var manaCost = 20;
var hasTarget = true;
var shouldNotCast = !(mana >= manaCost && hasTarget);

console.log({
  castCount: castCount,
  mana: mana,
  isActive: isActive,
  isNotOnCooldown: isNotOnCooldown,
  shouldNotCast: shouldNotCast
});
```

```js
// Unary B: typeof, unary plus/minus, void
var element = "fire";
var damage = 25;
var isEmpowered = false;
var spellConfig = { manaCost: 20 };

var isString = typeof element === "string";
var isNumber = typeof damage === "number";
var isBoolean = typeof isEmpowered === "boolean";
var isObject = typeof spellConfig === "object" && spellConfig !== null;

var positiveDamage = +damage;  // number
var negativeMana = -spellConfig.manaCost;
var absoluteValue = Math.abs(negativeMana);

var result = void 0; // example of void
console.log("Spell cast!");

console.log({
  isString: isString,
  isNumber: isNumber,
  isBoolean: isBoolean,
  isObject: isObject,
  positiveDamage: positiveDamage,
  negativeMana: negativeMana,
  absoluteValue: absoluteValue
});
```

**Common Mistakes:**
- `++` and `--` operators modify the original variable—be careful with reference types
- `typeof` returns strings—compare with string literals, not type constructors
- Unary `+` can convert strings to numbers—ensure the string represents a valid number

Key terms:
- Prefix vs postfix: `++x` increments, then uses; `x++` uses, then increments.
- `typeof`: reports the type as a string.

---

## Operator Precedence: Order of Operations

**What it is:**
Rules that determine the order in which operators are evaluated when multiple operators appear in the same expression.

**Why it matters:**
Understanding precedence prevents calculation errors and ensures spell formulas work as intended. Incorrect precedence can lead to wrong damage values or mana costs.

**How to use:**
Memorize a few rules, and otherwise add parentheses to make your intent explicit. Break complex expressions into well-named intermediate steps.

```js
// Precedence A: arithmetic grouping
var baseDamage = 30;
var multiplier = 1.5;
var bonus = 10;
var manaCost = 20;
var manaRegen = 5;

var damage1 = baseDamage * multiplier + bonus;
var damage2 = baseDamage * (multiplier + bonus);
var mana1 = manaCost + manaRegen * 2;
var mana2 = (manaCost + manaRegen) * 2;

console.log({
  damage1: damage1,
  damage2: damage2,
  mana1: mana1,
  mana2: mana2
});
```

```js
// Precedence B: logical and comparison
var manaCost = 20;
var mana = 50;
var hasTarget = true;
var isEmpowered = false;
var canCast1 = mana >= manaCost && hasTarget || isEmpowered;
var canCast2 = mana >= manaCost && (hasTarget || isEmpowered);

var damage = 75;
var isSpecial = true;
var isValid1 = damage > 0 && damage < 100;
var isValid2 = damage > 0 && damage < 100 || isSpecial;

var result = 0;
result += 10 * 2;
result *= 1.1;

console.log({
  canCast1: canCast1,
  canCast2: canCast2,
  isValid1: isValid1,
  isValid2: isValid2,
  result: result
});
```

**Common Mistakes:**
- Multiplication and division have higher precedence than addition and subtraction—use parentheses for clarity
- Logical AND (`&&`) has higher precedence than OR (`||`)—use parentheses to group conditions
- Assignment operators have very low precedence—be explicit about what you're assigning

Key terms:
- Precedence: which operators are evaluated first.
- Associativity: how operators of the same precedence group (usually left-to-right).

---

## Type Coercion: Automatic Type Conversion

**What it is:**
JavaScript's automatic conversion of values from one type to another during operations, which can cause unexpected results if not understood.

**Why it matters:**
Type coercion can cause subtle bugs in spell calculations and comparisons. Understanding when and how it occurs prevents runtime errors and incorrect spell behavior.

**How to use:**
Prefer explicit conversion with `Number(x)`, `String(x)`, and `Boolean(x)` when you need a different type. Be cautious when adding strings and numbers together—`+` concatenates if either side is a string.

```js
// Coercion A: strings and numbers
var damage = 25;
var manaCost = "15";

var message1 = "Damage: " + damage;
var message2 = damage + " damage";
var total1 = damage + manaCost; // "2515"
var total2 = damage + Number(manaCost); // 40

console.log({
  message1: message1,
  message2: message2,
  total1: total1,
  total2: total2
});
```

```js
// Coercion B: comparison and booleans
var damage = 25;
var element = "fire";

var isEqual1 = damage == "25"; // true
var isEqual2 = damage === "25"; // false
var isEqual3 = damage == 25; // true

var truthy1 = !!damage;
var truthy2 = !!element;
var truthy3 = !!"";
var truthy4 = !!0;
var truthy5 = !!null;

console.log({
  isEqual1: isEqual1,
  isEqual2: isEqual2,
  isEqual3: isEqual3,
  truthy1: truthy1,
  truthy2: truthy2,
  truthy3: truthy3,
  truthy4: truthy4,
  truthy5: truthy5
});
```

```js
// Coercion C: numeric conversion and safe checks
var manaCost = "15";
var element = "fire";
var isEmpowered = true;

var numeric1 = +manaCost;     // 15
var numeric2 = +element;      // NaN
var numeric3 = +isEmpowered;  // 1

var damage = 25;
var safeDamage = typeof damage === "number" ? damage : 0;
var safeManaCost = typeof manaCost === "string" ? parseInt(manaCost) : manaCost;

console.log({
  numeric1: numeric1,
  numeric2: numeric2,
  numeric3: numeric3,
  safeDamage: safeDamage,
  safeManaCost: safeManaCost
});
```

**Common Mistakes:**
- `==` performs type coercion—always use `===` for strict equality
- String concatenation with `+` can cause unexpected results—use `Number()` for explicit conversion
- Truthy/falsy values can be confusing—use explicit boolean comparisons when clarity is important

Key terms:
- Implicit coercion: JavaScript converts types for you (can surprise you).
- Explicit conversion: you convert types on purpose with helper functions.

---

## Putting It All Together

```js
// Putting It Together A: damage calculation only
function SpellCalculator() { this.baseDamage = 30; this.comboCount = 0; this.isEmpowered = false; }
SpellCalculator.prototype.calculateDamage = function(target, distance) {
  var damage = this.baseDamage;
  if (target && typeof target.health === "number" && target.health < 25) { damage *= 1.2; }
  if (this.isEmpowered && distance <= 5) { damage *= 1.5; }
    this.comboCount += 1;
  var finalDamage = Math.round(damage * (1 + this.comboCount * 0.1));
  return finalDamage;
};
var calcA = new SpellCalculator();
var dmgA = calcA.calculateDamage({health: 20}, 3);
console.log("Damage:", dmgA);
```

```js
// Putting It Together B: cast check only
function SpellCalculator() { this.manaCost = 15; this.isEmpowered = false; this.isOnCooldown = false; }
SpellCalculator.prototype.canCast = function(currentMana, hasTarget) {
  return (currentMana >= this.manaCost) && hasTarget && (!this.isOnCooldown || this.isEmpowered);
};
var calcB = new SpellCalculator();
console.log("Can cast (50 mana, hasTarget):", calcB.canCast(50, true));
```

```js
// Putting It Together C: state updates only
function SpellCalculator() { this.comboCount = 0; this.manaSpent = 0; this.hitsThisCombo = 0; this.isEmpowered = false; }
SpellCalculator.prototype.updateState = function(manaSpent, targetHit) {
    this.manaSpent += manaSpent;
    this.hitsThisCombo += targetHit ? 1 : 0;
  this.comboCount += 1;
    this.isEmpowered = this.comboCount >= 5;
};
var calcC = new SpellCalculator();
calcC.updateState(10, true);
calcC.updateState(5, false);
console.log({ manaSpent: calcC.manaSpent, hitsThisCombo: calcC.hitsThisCombo, comboCount: calcC.comboCount, isEmpowered: calcC.isEmpowered });
```

This example demonstrates how all operator types work together in a complete spell calculation system, showing proper precedence, type safety, and state management.

---

## Next Steps

- Continue to **Control Flow** to learn branching and looping patterns for spell logic.
- Jump to **Functions & Scope** for organizing spell code into reusable modules.
- Reference the **Glossary** for definitions of technical terms used throughout this guide.

Mastering operators and expressions provides the mathematical and logical foundation for building sophisticated spell systems that calculate accurately and behave predictably.
