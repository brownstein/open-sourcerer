# Data Types & Collections

Understanding JavaScript's data types and collection structures is crucial for organizing spell data, managing game state, and building complex spell behaviors. This guide covers primitive types, objects, arrays, and advanced collection patterns you'll use throughout **Open Sourcerer**.

---

## Overview

**What it is:** Quick links to common data shapes you’ll use while scripting.

**Why it matters:** Picking the right type—and understanding its behavior—prevents subtle bugs and clarifies your spell logic.

| Concept | Quick Example | When You’ll Use It |
| --- | --- | --- |
| [Strings](#Strings:%20Text%20and%20Identifiers) | `"fireball"` | Element names, spell descriptions, target IDs |
| [Numbers](#Numbers:%20Calculations%20and%20Measurements) | `42`, `3.14` | Damage values, coordinates, durations |
| [Booleans](#Booleans:%20Logic%20and%20State) | `true`, `false` | Status flags, conditional checks |
| [Objects](#Objects:%20Structured%20Data) | `{damage: 50, radius: 3}` | Spell configurations, entity data |
| [Arrays](#Arrays:%20Ordered%20Collections) | `["fire", "ice", "spark"]` | Element lists, projectile patterns |
| [Special Values](#Special%20Values:%20null,%20undefined,%20and%20NaN) | `null`, `undefined`, `NaN` | Empty states or invalid math |
| [Type Checking](#Type%20Checking%20and%20Validation) | `typeof`, `Array.isArray()` | Validate inputs before casting |
| [Collection Patterns](#Collection%20Patterns%20for%20Spells) | `Map`, `Set`, registries | Organize and track spell data |
| [Performance](#Performance%20Considerations) | typed arrays, pools | Keep complex spells smooth |

Each type behaves differently when copied, compared, or passed to functions—understanding these behaviors prevents subtle bugs in spell logic.

---

## Core Definitions (Beginner Friendly)

**Primitive:** A value that is not an object and has no methods. In JavaScript, primitives are `string`, `number`, `boolean`, `null`, `undefined`, and `symbol` (advanced). Primitives are:
- Immutable: you can’t change the value itself (e.g., turning `"fire"` into `"ice"` creates a new string).
- Compared by value: `5 === 5` is true because the values match.
- Copied by value: assigning to another variable makes an independent copy.

**Reference Type:** Values like `object`, `array`, and `function`. Reference types are:
- Mutable by default: you can change fields or items in-place.
- Compared by reference (identity): two different objects with the same content are still not equal.
- Copied by reference: `b = a` points `b` to the same underlying object as `a`.

**Mutable vs Immutable:**
- Mutable data can be changed after creation (objects/arrays). This is convenient but can cause “action at a distance” when the same object is shared across parts of your spell.
- Immutable data never changes after creation (primitives). To “change” you create a new value.
- Practical approach: treat configuration objects as read-mostly and carefully control where mutation happens.

**Shallow vs Deep Copy:**
- Shallow copy duplicates only the top-level properties (nested objects still share references).
- Deep copy duplicates the entire structure (every nested object/array). Deep copy is more expensive and should be used when you truly need independence.

Keep these definitions in mind as you read the sections below—they explain many “why did my value change?” bugs.

---

## Beginner Vocabulary (Quick Reference)

- Identifier: a name you give to a variable, function, or property (e.g., `spellName`).
- Property (field): a named value inside an object (e.g., `config.damage`).
- Method: a function stored on an object (e.g., `player.cast()`).
- Concatenation: joining strings together ("fire" + "ball" → "fireball").
- Index: the position of an item in an array, starting at 0.
- Iterate: go through items one by one (often with a loop).
- Coercion: when JavaScript automatically converts a value to another type ("15" → 15 in some cases).
- Parse: manually convert from text to a data type (e.g., `parseInt("15")` → 15).
- Shape (schema): an informal description of what keys and value types an object has.

---

## Primitive Types Deep Dive

### Strings: Text and Identifiers

**What it is:**
Immutable sequences of characters used for names, descriptions, and identifiers throughout the spell system.

**Why it matters:**
Strings are the primary way to reference elements, entities, and spell configurations. Proper string handling ensures reliable spell targeting and data retrieval.

**How to use:**

```js
const element = "fire";
const spellName = "Inferno Blast";
const targetId = "enemy_goblin_001";

// String concatenation for dynamic content
const message = "Casting " + spellName + " on " + targetId;
console.log(message);

// String methods for validation
if (element.toLowerCase() === "fire") {
  console.log("Fire element detected");
}
```

**Common Mistakes:**
- String comparison is case-sensitive—use `.toLowerCase()` for flexible matching
- Empty strings `""` are falsy but different from `null` or `undefined`
- Template literals preserve whitespace and newlines

Key terms:
- Immutable: once created, a string cannot be changed; building a new string creates a new value.
- Identifier: a string often used as a label (like a spell name or target id).

### Numbers: Calculations and Measurements

**What it is:**
JavaScript's single number type handles both integers and floating-point values for all mathematical operations.

**Why it matters:**
Spell damage, cooldowns, ranges, and coordinates all rely on precise number handling. Understanding number behavior prevents calculation errors.

**How to use:**

```js
const baseDamage = 25;
const multiplier = 1.5;
const radius = 3.14;
const duration = 2000; // milliseconds

// Arithmetic operations
const totalDamage = baseDamage * multiplier;
const area = Math.PI * radius * radius;

// Number methods and utilities
const roundedDamage = Math.round(totalDamage);
const clampedValue = Math.max(0, Math.min(100, totalDamage));

console.log({
  totalDamage,
  area: area.toFixed(2),
  roundedDamage,
  clampedValue
});
```

**Common Mistakes:**
- Floating-point precision can cause unexpected results: `0.1 + 0.2 !== 0.3`
- Use `Math.round()`, `Math.floor()`, or `Math.ceil()` for integer results
- `NaN` (Not a Number) propagates through calculations—check with `isNaN()`

Key terms:
- Floating point: a way computers store decimals; tiny rounding errors can appear.
- Clamp: force a number into a min..max range (e.g., between 0 and 100).

### Booleans: Logic and State

**What it is:**
True/false values that control spell behavior, track status effects, and manage conditional logic.

**Why it matters:**
Booleans drive spell branching, status tracking, and performance optimizations. Clear boolean logic makes spells predictable and debuggable.

**How to use:**

```js
const isEmpowered = true;
const hasTarget = false;
const mana = 15;
const manaCost = 12;
const canCast = mana >= manaCost;

// Boolean operations
const shouldCombo = isEmpowered && hasTarget;
const needsMana = !canCast;

// Conditional execution
if (shouldCombo) {
  console.log("Executing combo attack");
} else if (needsMana) {
  console.log("Insufficient mana");
} else {
  console.log("Standard attack");
}
```

**Common Mistakes:**
- Truthy/falsy values: `0`, `""`, `null`, `undefined`, `false` are falsy
- Use explicit comparisons: `if (value === true)` vs `if (value)`
- Boolean operators (`&&`, `||`) return the last evaluated value, not always `true`/`false`

Key terms:
- Negation (`!x`): flips true to false and false to true.
- Truthy/falsy: values that behave like true/false in conditions.

---

## Objects: Structured Data

**What it is:**
Key-value collections that organize related data into logical groups. Essential for spell configurations and entity properties.

**Why it matters:**
Objects provide structure for complex spell data, making code readable and maintainable. They're the primary way to pass multiple parameters to spell functions.

**How to use:**
Think of an object as a labeled box where each label (the “key”) points to a value. Keys are strings; values can be any type (number, string, boolean, object, array, etc.). Use dot notation when the key is a valid identifier (`config.damage`), and bracket notation when the key is dynamic or contains special characters (`config[dynamicKey]`).

Concepts to know before coding:
- Mutability: objects are mutable and passed by reference. If two variables point to the same object and one changes it, both “see” the change.
- Copying: assigning `const b = a;` does not copy—both reference the same object. For a shallow copy, build a new object and copy fields manually (shown below). Deep copies require copying nested objects too.
- Shape: it’s helpful (for humans) to think of objects as having a “shape”—which keys exist and their types. Stick to a consistent shape for each kind of config.
- Access: prefer dot access for known keys and bracket access for computed keys or keys with spaces/invalid characters.
- Order: modern engines often preserve insertion order for string keys, but do not rely on it for correctness.

Access patterns (examples):
```js
// Dot vs bracket access
var config = { damage: 40, element: "fire" };
console.log(config.damage);          // dot (known key)
var key = "element";
console.log(config[key]);            // bracket (dynamic key)

// Nested access with guards
var player = { stats: { hp: 100 } };
if (player && player.stats) {
  console.log("hp:", player.stats.hp);
}

// Remove and copy (shallow)
delete config.element;               // remove a property
var copy = { damage: config.damage }; // manual shallow copy
```

```js
// Spell configuration object
const fireballConfig = {
  damage: 45,
  radius: 2.5,
  element: "fire",
  manaCost: 20,
  cooldown: 1500,
  empowered: false
};

// Accessing properties
console.log("Fireball damage:", fireballConfig.damage);
console.log("Element:", fireballConfig.element);

// Modifying properties
fireballConfig.empowered = true;
fireballConfig.damage *= 1.3;

// Object methods
const keys = Object.keys(fireballConfig);
console.log("Configuration keys:", keys);

// Manual iteration for compatibility
console.log("Configuration values:");
for (const key of keys) {
  console.log(key + ":", fireballConfig[key]);
}
```

**Advanced Object Patterns:**

```js
// Function with object parameter (compatible approach)
function castSpell(config) {
  const damage = config.damage;
  const radius = config.radius;
  const element = config.element;
  const manaCost = config.manaCost;
  
  console.log("Casting " + element + " spell with " + damage + " damage");
  return {damage: damage, radius: radius, manaCost: manaCost};
}

// Object merging using manual copying (compatible approach)
const baseConfig = {damage: 30, radius: 2, element: "fire"};
const empoweredConfig = {
  damage: 45,
  radius: baseConfig.radius,
  element: baseConfig.element,
  empowered: true
};

// Dynamic property assignment (compatible approach)
const element = "ice";
const spellData = {};
spellData[element + "Damage"] = 35;
spellData[element + "Radius"] = 3;
spellData.element = element;

// Demonstrate the concepts in action
console.log("Base config:", baseConfig);
console.log("Empowered config:", empoweredConfig);
console.log("Spell data:", spellData);

// Call the function to see it work
const result = castSpell(empoweredConfig);
console.log("Cast result:", result);
```

**Common Mistakes:**
- Objects are reference types—modifying them affects all references
- Use `Object.assign()` or spread syntax `{...obj}` for shallow copying
- Property access with `obj.key` vs `obj["key"]`—brackets allow dynamic keys

When to choose an object vs an array:
- Choose an object when you need named fields (e.g., `damage`, `radius`, `element`).
- Choose an array when order matters and items are homogeneous (e.g., a list of spell names).
- Combine them as needed (e.g., an object with array fields).

---

## Arrays: Ordered Collections

**What it is:**
Ordered lists of values that maintain sequence and provide indexed access. Perfect for managing multiple projectiles, spell sequences, or element lists.

**Why it matters:**
Arrays handle collections of entities, manage spell chains, and provide iteration patterns essential for complex spell behaviors.

**How to use:**
Arrays are zero-based (`elements[0]` is the first item). The `length` reflects the number of items and updates automatically when you `push`/`pop`. Prefer `push`/`pop` for performance (adding/removing at the end) over `shift`/`unshift` (which re-index items at the start). Keep item types consistent inside a given array.

Key terms:
- Index: the position of an item in an array, starting at 0.
- Sparse array: an array with missing indices (e.g., `arr[5]` exists but `arr[2]` does not); avoid unless necessary.

Access patterns (examples):
```js
var nums = [5, 10, 15];

// Indexing and iteration
for (var i = 0; i < nums.length; i++) {
  console.log(i, nums[i]);
}

// Find first index of value (manual search)
var idx = -1;
for (var i = 0; i < nums.length; i++) {
  if (nums[i] === 10) { idx = i; break; }
}
console.log("index of 10:", idx);
```

```js
// Basic array operations
const elements = ["fire", "ice", "spark"];
console.log("Elements:", elements);
console.log("First element:", elements[0]);
console.log("Last element:", elements[elements.length - 1]);

// Adding and removing elements
elements.push("earth");
console.log("After adding earth:", elements);

const removed = elements.pop();
console.log("Removed:", removed);
console.log("Final elements:", elements);
```

**Advanced Array Patterns:**

```js
// Multi-dimensional arrays for spell grids
const spellGrid = [
  ["fire", "ice", "spark"],
  ["earth", "void", "light"]
];

console.log("Spell grid:");
for (let row = 0; row < spellGrid.length; row++) {
  console.log("Row " + row + ":", spellGrid[row]);
}

// Finding elements in arrays
const spellSequence = ["charge", "aim", "cast", "impact"];
let currentPhase = -1;
for (let i = 0; i < spellSequence.length; i++) {
  if (spellSequence[i] === "aim") {
    currentPhase = i;
    break;
  }
}
console.log("Current phase index:", currentPhase);
```

**Common Mistakes:**
- Array indices start at 0, not 1
- `length` property is writable—setting it truncates or extends the array
- `forEach` doesn't return a new array; use `map` for transformations
- Sparse arrays (with gaps) can cause unexpected behavior

---

## Special Values: null, undefined, and NaN

**What it is:**
Special values that represent absence of data, missing properties, or invalid calculations.

**Why it matters:**
Proper handling of these values prevents runtime errors and ensures robust spell behavior when data is missing or invalid.

**How to use:**

```js
// Special values: null, undefined, NaN
let currentTarget = null; // Explicitly no target
let spellData; // undefined - not yet assigned

console.log("currentTarget:", currentTarget);
console.log("spellData:", spellData);

// Checking for special values
if (currentTarget === null) {
  console.log("No target selected");
}

if (spellData === undefined) {
  console.log("Spell data not loaded");
}

// NaN handling
const invalidCalculation = "fire" * 5; // Results in NaN
console.log("Invalid calculation:", invalidCalculation);
if (isNaN(invalidCalculation)) {
  console.log("Invalid calculation detected");
}
```

Guidance for beginners:
- `undefined` usually means “not set yet”; `null` means “intentionally empty”. Use `null` when you want to say “no value on purpose”.
- `NaN` stands for “Not a Number” and appears when math fails (e.g., multiplying a string by a number). Use `isNaN(value)` to detect it before continuing calculations.

**Common Mistakes:**
- `null` is an intentional empty value; `undefined` means "not set"
- `==` performs type coercion (`null == undefined` is true); use `===` for strict comparison
- `NaN` is not equal to itself—use `isNaN()` or `Number.isNaN()` to check
- Optional chaining `?.` prevents errors but returns `undefined` for missing properties

---

## Type Checking and Validation

**What it is:**
Techniques to verify data types and validate spell parameters before execution.

**Why it matters:**
Type checking prevents runtime errors and ensures spells receive expected data formats. Essential for robust spell systems.

**How to use:**

```js
// Type checking functions
function isValidElement(element) {
  return typeof element === "string" && element.length > 0;
}

function isValidDamage(damage) {
  return typeof damage === "number" && damage > 0 && !isNaN(damage);
}

// Test the validation functions
console.log("isValidElement('fire'):", isValidElement("fire"));
console.log("isValidElement(''):", isValidElement(""));
console.log("isValidDamage(25):", isValidDamage(25));
console.log("isValidDamage(-5):", isValidDamage(-5));

// Runtime type checking
const spellData = {element: "fire", damage: 25};
console.log("Element type:", typeof spellData.element);
console.log("Is object:", typeof spellData === "object" && spellData !== null);
```

**Common Mistakes:**
- `typeof null` returns `"object"`—check `obj !== null` for true objects
- `Array.isArray()` is more reliable than `typeof arr === "object"`
- `typeof` can't distinguish between different object types
- Use `instanceof` for custom object types, but it doesn't work across different execution contexts

Helpful `typeof` results to memorize:
- `typeof 123` → `"number"`
- `typeof "text"` → `"string"`
- `typeof true` → `"boolean"`
- `typeof undefined` → `"undefined"`
- `typeof null` → `"object"` (special case)
- `typeof {}` → `"object"`
- `typeof function() {}` → `"function"`

Key terms:
- `typeof`: built-in operator that reports a value’s type as a string.
- `Array.isArray(v)`: safely checks if `v` is an array.
- `instanceof`: checks if an object was created by a specific constructor (advanced; can be unreliable across realms).

---

## Collection Patterns for Spells

**What it is:**
Common ways to organize related data structures so your code stays simple and fast. Patterns give names to solutions you’ll reuse across spells and systems.

**Why it matters:**
These patterns provide proven solutions for managing complex spell data, making code more maintainable and performant.

**How to use:**
Pick the pattern that matches your access needs:
- Registry (lookup by name/id): a plain object where keys are spell names/ids and values are configs. Fast direct access—`spells["fireball"]`.
- Mapping/grouping: an object of arrays (e.g., elements → list of spells). Useful to list or filter by category.
- Status store: an object that records active effects with metadata (target, duration, tick rate). Centralizes lifetime management.
- Cooldown set: represent “on cooldown” spells via an object of booleans. Use `hasOwnProperty` to test and delete to clear.
- Sequence/queue: an array to capture the order of recent casts or steps in a combo.

```js
// Spell registry pattern
const spellRegistry = {
  fireball: {
    damage: 40,
    radius: 2,
    manaCost: 15,
    cooldown: 1000
  },
  iceShard: {
    damage: 25,
    radius: 1,
    manaCost: 10,
    cooldown: 800
  }
};

console.log("Fireball config:", spellRegistry.fireball);
console.log("Ice shard config:", spellRegistry.iceShard);

// Element-to-spell mapping
const elementSpells = {
  fire: ["fireball", "inferno", "ember"],
  ice: ["iceShard", "frostNova", "blizzard"]
};

console.log("Fire spells:", elementSpells.fire);
console.log("Ice spells:", elementSpells.ice);
```

**Advanced Collection Techniques:**

```js
// Spell chain management using constructor function
function SpellChain() {
    this.sequence = [];
    this.maxLength = 5;
  }
  
SpellChain.prototype.addSpell = function(spell) {
    this.sequence.push(spell);
    if (this.sequence.length > this.maxLength) {
      this.sequence.shift();
    }
};
  
SpellChain.prototype.getComboMultiplier = function() {
    return Math.min(this.sequence.length * 0.2, 1.0);
};

// Test spell chain
const chain = new SpellChain();
chain.addSpell("fireball");
chain.addSpell("iceShard");
chain.addSpell("lightning");

console.log("Spell sequence:", chain.sequence);
console.log("Combo multiplier:", chain.getComboMultiplier());
```

**Common Mistakes:**
- `Map` and `Set` preserve insertion order, unlike regular objects
- `WeakMap` and `WeakSet` don't prevent garbage collection of keys
- Use `Map` for string keys that might conflict with object properties
- `Set` automatically handles uniqueness—no duplicate values

Tips for choosing a pattern:
- Need constant-time lookup by id? Use a registry object.
- Need ordering semantics? Use arrays (and document whether newest is at the end).
- Need fast membership tests (is on cooldown)? Use an object of flags.
- Need both order and lookup? Keep an array for order plus a registry for direct access.

---

## Performance Considerations

**What it is:**
Optimization strategies for data structures that impact spell performance and memory usage.

**Why it matters:**
Efficient data handling ensures smooth gameplay, especially with complex spells that process large amounts of data.

**How to use:**
Prefer cheap, predictable operations and avoid unnecessary work:
- Choose the right container: registry objects for id lookups; arrays for ordered lists.
- Avoid allocating inside tight loops—create once, reuse if possible.
- Pre-compute lookups (e.g., `id → index`) for hot paths.
- Prefer `push`/`pop` over `unshift`/`shift` (shifting reindexes the array).
- Cache derived values if they’re reused many times within a single frame.
- Keep logs concise in hot code—logging is relatively expensive.

About time complexity (optional topic):
- You may see terms like O(1) and O(n). These describe how work grows as your data grows.
- O(1) (constant time): work stays about the same no matter how many items you have (e.g., `spells["fireball"]`).
- O(n) (linear time): work grows with the number of items (e.g., searching an array from start to finish).
- This is a Computer Science topic outside the game’s scope, but the idea helps you pick data structures that stay fast as your collection grows.

```js
// Pre-allocate arrays for known sizes
const projectileArray = new Array(10);
const damageArray = new Array(100);
for (let i = 0; i < damageArray.length; i++) {
  damageArray[i] = 0;
}

console.log("Projectile array length:", projectileArray.length);
console.log("Damage array length:", damageArray.length);
console.log("First 5 damage values:", damageArray.slice(0, 5));

// Efficient iteration
const largeArray = new Array(1000);
for (let i = 0; i < largeArray.length; i++) {
  largeArray[i] = i;
}

// Use traditional for loop for maximum performance
let sum = 0;
for (let i = 0; i < largeArray.length; i++) {
  sum += largeArray[i];
}
console.log("Sum of first 1000 numbers:", sum);
```

**Common Mistakes:**
- Avoid creating objects/arrays inside tight loops
- Prefer classic for loops instead of `forEach` for performance and compatibility
- `Map` and `Set` have O(1) average access time vs O(n) for array searches
- Typed arrays are more memory-efficient for numeric data but less flexible

---

## Putting It All Together

```js
// Simple spell management system
function SpellManager() {
  this.spells = {};
  this.cooldowns = {};
  }
  
SpellManager.prototype.registerSpell = function(name, config) {
  this.spells[name] = {
    damage: config.damage,
    manaCost: config.manaCost,
    cooldown: config.cooldown,
    element: config.element,
    castCount: 0
  };
};

SpellManager.prototype.castSpell = function(spellName, target) {
  const spell = this.spells[spellName];
    if (!spell) {
      console.error("Unknown spell: " + spellName);
      return false;
    }
    
  if (this.cooldowns.hasOwnProperty(spellName)) {
      console.log(spellName + " is on cooldown");
      return false;
    }
    
  // Apply damage
  target.health -= spell.damage;
    spell.castCount++;
    
    // Start cooldown
  const self = this;
  this.cooldowns[spellName] = true;
  setTimeout(function() {
    delete self.cooldowns[spellName];
  }, spell.cooldown);
  
  console.log("Cast " + spellName + " for " + spell.damage + " damage");
  return true;
};

// Test the system
const spellManager = new SpellManager();
spellManager.registerSpell("fireball", {
  damage: 40,
  manaCost: 15,
  cooldown: 1000,
  element: "fire"
});

const target = {name: "Goblin", health: 100};
console.log("Target health:", target.health);
spellManager.castSpell("fireball", target);
console.log("Target health after spell:", target.health);
```

This example demonstrates proper data structure usage, type validation, and performance considerations in a complete spell management system.

---

## Next Steps

- Continue to **Control Flow** to learn branching and looping patterns for spell logic.
- Jump to **Functions & Scope** for organizing spell code into reusable modules.
- Reference the **Glossary** for definitions of technical terms used throughout this guide.

Mastering data types and collections provides the foundation for building sophisticated spell systems that are both powerful and maintainable.
