# Syntax & Variables

Mastering syntax and variables is the first step toward casting reliable spells. This guide focuses on the JavaScript fundamentals you need inside **Open Sourcerer**—from statement structure to variable scoping—and connects each concept to in-game behavior.

---

## Overview

| Concept | Quick Example | When You’ll Use It |
| --- | --- | --- |
| [Statements](#Statements) | `attack();` | Trigger a spell action or call a helper. |
| [Expressions](#Expressions) | `manaCost * 1.2` | Calculate updated values for cooldowns or damage. |
| [Variables](#Declaring%20Variables) | `const flameRadius = 3;` | Store parameters you’ll tweak over time. |
| [Blocks](#Blocks) | `{ ... }` | Group logic inside functions, conditionals, or loops. |
| [Comments](#Comments) | `// adjust for empowered state` | Leave notes for future you (or teammates). |

Each of these maps directly to the spell runtime in the Shrine sandbox. Guard against syntax errors early—they prevent your script from executing at all.

---

## What “Syntax” Means

**What it is:**
“Syntax” is the set of rules about how code must be written so the computer can understand it—punctuation, spelling, and order. In English, a sentence needs words in a sensible order and a period at the end. In code, a statement might need parentheses `()` and a semicolon `;`.

**Why it matters:**
When syntax is off by even one character, the program can’t run. Fixing syntax early keeps your focus on the fun part: making your spell behave the way you want.

**How to use:**
Start small. Write one line, run it, and look at the Console. If there’s a red error, the message will point to a line and a character where the syntax broke.

**Common Mistakes:**
- Missing closing characters: `(` `)` `{` `}` `"`
- Typos in keywords: writing `cons` instead of `const`
- Forgetting commas between list items: `[1, 2 3]` should be `[1, 2, 3]`

---

## Statements

**What it is:**
A statement is a complete instruction—like a sentence. In JavaScript we usually end statements with a semicolon `;`.

**Why it matters:**
Clear statements make your spell’s steps easy to read and execute in order.

**How to use:**
Each action is one statement. For example, this calls the `attack` action once:

**Common Mistakes:**
- Merging two ideas into one line (hard to read)
- Forgetting the `()` when calling a function: `attack;` won’t run anything

**Try in code editor:**
```js
// Fix the syntax by adding the missing ')' and ';'
console.log("Hello Ecma 6" // <- missing )
```

---

## Expressions

**What it is:**
An expression produces a value—like a math problem or a comparison: `2 + 2`, `mana >= cost`.

**Why it matters:**
Expressions are how you calculate damage, decide conditions, and build strings to log.

**How to use:**
Put expressions inside statements to do work with the result.

```js
const cost = 12;
const mana = 15;
const canCast = mana >= cost; // expression produces true/false
console.log("Can cast?", canCast);
```

**Common Mistakes:**
- Using `=` (assignment) when you meant `===` (equality check)
- Relying on math without parentheses, which can change results

**Try in code editor:**
```js
const base = 30;
const bonus = 6;
console.log("Total:", base + bonus);
console.log("Is big hit?", (base + bonus) > 40);
```

---

## The Editor

**What it is:**
The code-writing interface where players author and run scripts. Provides syntax highlighting, linting, error surfacing, and integration with "Run" and "Save to Hotbar".

**Why it matters:**
Tightens the feedback loop: write → run → inspect logs → iterate. Reduces syntax/typo errors and teaches best practices through in-place hints.

**How to use:**

* Open the editor, paste or type code, click **Run** to execute in the Shrine sandbox.
* Click **Save** to bind scripts to the hotbar for in-game casting.

**Common Mistakes:**

* Auto-formatters may reorder imports or tweak quotes—keep examples flexible.
* Tabs vs spaces only affects appearance, not execution.
* Editor warnings are static analysis; some issues only appear at runtime.

---

## Declaring Variables

**What it is:**
A variable is a named box that holds a value. You give the box a name (like `comboCount`) and the game remembers the value inside it while your spell runs.

**Why it matters:**
Variables let you store numbers, text, or settings so your spell can change behavior over time—track hits, store target names, or toggle empowered states.

**How to use:**
- Use `const` when the reference never changes.
- Use `let` when the value must change during the spell.
- Avoid `var` (older style) because it can behave unexpectedly.

**Common Mistakes:**
- Reassigning a `const` (will throw an error)
- Forgetting to initialize a variable before using it
- Mixing up names (`comboCount` vs `comboCounts`)

**Try in code editor:**
Open Sourcerer supports modern JavaScript syntax. Prefer `const` by default and fall back to `let` only when you must reassign.

```js
const baseDamage = 40; // never reassign
let comboCount = 0;    // increments as the spell chains

comboCount += 1; // Equal to comboCount = comboCount + 1

console.log("Combo count after increment:", comboCount);
```

### When to Use Each Declaration

| Keyword | Reassignment | Scope | Typical Use |
| --- | --- | --- | --- |
| `const` | ❌ | Block | Configuration values, references to game services, immutable data. |
| `let` | ✅ | Block | Counters, temporary calculations within a function. |
| `var` | ✅ | Function (legacy) | Avoid—hoisting and function scope can produce unintended bugs. |

Block scope means variables defined inside `{}` are only accessible within that block—helpful when avoiding naming collisions between phases of a spell.

---

## Blocks

**What it is:**
A block is a group of statements wrapped in `{ }`. Blocks belong to things like `if` checks and functions.

**Why it matters:**
Blocks make temporary variables local, so they don’t leak into other parts of your spell.

**How to use:**
```js
if (true) {
  const inside = "only visible here";
  console.log(inside);
}
// console.log(inside); // ← would error: not defined here
```

**Common Mistakes:**
- Forgetting `{}` which can make only one line part of the `if`
- Reusing a name inside/outside and getting confused which value you’re reading

**Try in code editor:**
```js
const empowered = true;
if (empowered) {
  let damage = 20;
  damage += 10; // boosted inside
  console.log("Damage in block:", damage);
}
console.log("Outside block: damage is not defined here");
```

---

## Primitive Types You’ll Use Frequently

```js
const element = "fire";         // string
const projectileCount = 3;       // number
const empowered = true;          // boolean
const cooldownMs = 1500;         // number
const noTarget = null;           // explicit empty value
let currentTarget;               // undefined until assigned

console.log(
  "Primitive values",
  {
    element,
    projectileCount,
    empowered,
    cooldownMs,
    noTarget,
    currentTarget
  }
);
```

Primitive values are copied when passed around—no shared references. For collections (arrays, objects), remember they’re references; mutating them affects the original.

---

## Expressions & Statements in Practice

Every statement ends with a semicolon (the editor will insert it if you forget). Combine expressions to compute results:

```js
// Define inputs used in calculations
const baseDamage = 40;
let comboCount = 2;
const empowered = true;

// Compute derived values
const manaCost = baseDamage * 0.6 + comboCount * 5;

if (empowered) {
  const bonus = Math.min(comboCount * 8, 40);
  console.log("Casting empowered fire nova with damage:", baseDamage + bonus);
} else {
  console.log("Casting basic fire nova with damage:", baseDamage);
}

console.log("Mana cost for this cast:", manaCost);
```

### Common Patterns

- **Assignment** – `comboCount = comboCount + 1;`
- **Compound assignment** – `comboCount += 1;`
- **Template literals** – `` `${element.toUpperCase()} Strike` `` for naming spells.
- **Function calls** – `applyStatus(target, "burning", 4_000);`

---

## Comments

**What it is:**
Notes you leave for yourself or teammates. The computer ignores them.

**Why it matters:**
Comments explain “why” a choice was made—vital context when you revisit a spell later.

**How to use:**
- Single-line: start with `//`
- Multi-line: wrap with `/* ... */`

```js
const isEmpowered = true;
let comboCount = 2;

// Increase radius if spell is empowered
const radius = isEmpowered ? 4 : 2;

/*
  We limit the maximum bonus so the spell stays balanced
  in early areas.
*/
const bonus = Math.min(comboCount * 8, 40);
```

**Common Mistakes:**
- Leaving outdated comments that contradict the code
- Using comments to prop up confusing code—instead, simplify the code

**Try in code editor:**
```js
// Describe what this log shows
console.log("Hello from your first comment!");
```

---

## Scope & Lifetime

Understanding where variables live prevents spooky behavior during rapid spell execution.

```js
function castEmpoweredStrike(targetName) {
  let strikesRemaining = 3;

  while (strikesRemaining > 0) {
    const delayMs = 250 * strikesRemaining;
    console.log(
      "Scheduling strike",
      strikesRemaining,
      "with delay",
      delayMs,
      "ms on",
      targetName
    );
    strikesRemaining -= 1;
  }

  console.log("All strikes scheduled for", targetName);
}

castEmpoweredStrike("Training Dummy");
```

- `strikesRemaining` is block-scoped to the function; each invocation starts at 3.
- The inner `delay` variable is re-created on each loop iteration (no shared mutation).
- Avoid leaking temporary variables to the global scope—wrap logic inside functions or modules.

---

## Naming Conventions

Follow consistent naming to make spells readable:

- `camelCase` for variables and functions (`fireballRadius`, `applyKnockback`).
- Booleans prefixed with `is`, `has`, or `should` (`isEmpowered`, `shouldComboContinue`).
- Constants in UPPER_SNAKE_CASE when values are truly fixed (`MAX_PROJECTILES`).
- Group related constants into objects:

```js
// Stronger example showing naming patterns working together
const MAX_PROJECTILES = 5;                  // UPPER_SNAKE_CASE constant
const FIRE_SCALING = {                      // grouped related constants
  ember: 0.85,
  blaze: 1.10,
  inferno: 1.35
};

function applyKnockback(target, force) {    // camelCase function
  target.vx += force.x;
  target.vy += force.y;
}

function computeProjectileRadius(element, baseRadius, isEmpowered) { // camelCase + boolean prefix
  let radius = baseRadius;
  if (isEmpowered && element === "fire") {
    radius *= FIRE_SCALING.blaze;           // use grouped constants
  }
  return Math.min(radius, 6);               // cap for balance
}

// Example usage
const target = { vx: 0, vy: 0 };
applyKnockback(target, { x: 0.5, y: 0.2 });

const fireballRadius = computeProjectileRadius("fire", 2.0, true); // camelCase variable
console.log({ MAX_PROJECTILES, fireballRadius, target });
```

---

## Debugging Variables

Use the in-game console to inspect values during runtime:

```js
const element = "ice";
const comboCount = 2;
const manaCost = 18;

console.log({ element, comboCount, manaCost });
```

Attach labels so logs remain readable in combat. For more complex data, `console.table()` provides a tabular view.

> **Tip:** Temporary logs are invaluable while prototyping but remove them when you commit a spell to your collection—excessive logging can clutter the console mid-battle.

---

## Putting It All Together

```js
const BASE_DAMAGE = 24;

function computeIgniteDamage(hasEmberHeart) {
  let damage = BASE_DAMAGE;

  if (hasEmberHeart) {
    const bonus = Math.floor(BASE_DAMAGE * 0.5);
    damage += bonus;
    console.log("Ignite empowered! +" + bonus + " damage");
  }

  return damage;
}

const damageWithBuff = computeIgniteDamage(true);
const damageWithoutBuff = computeIgniteDamage(false);

console.log({ damageWithBuff, damageWithoutBuff });
```

This snippet uses constants, conditional logic, template literals, and helper functions. Notice the deliberate scoping: `damage` is limited to the function, and the console message aids debugging when buffs are active.

---

## Next Steps

- Continue to **Data Types & Collections** to structure spell metadata.
- Jump to **Control Flow** for branching and looping patterns tailored to combat scenarios.
- Reference the **Glossary** if you encounter unfamiliar terminology.

By internalizing syntax and variable patterns, you’ll script confidently and spend more time designing inventive spell mechanics.
