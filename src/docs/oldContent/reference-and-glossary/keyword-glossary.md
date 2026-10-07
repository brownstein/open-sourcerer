# Keyword Glossary

Use this glossary to quickly look up core terms used throughout the Open Sourcerer documentation. Each entry includes a short definition, where to learn more, and related keywords that the Docs search understands.

> **Tip:** The search box in the Docs index recognizes all keywords listed here. Start typing any of them to jump straight to the relevant sub-page.

---

## Core Concepts

### **Editor**
*In-game code environment for writing, running, and saving scripts. Highlights syntax and surfaces errors in real time.*

**See Also:** Getting Started → Using the Docs & Editor; Core JavaScript → Syntax & Variables  
**Keywords:** `editor`, `run`, `save`, `console`

### **Console**
*Output panel that mirrors `console.log`, warnings, and runtime errors. Essential for debugging spells.*

**See Also:** Getting Started → Using the Docs & Editor; Core JavaScript → Syntax & Variables  
**Keywords:** `console`, `logging`, `debug`

### **console.log()**
*Function that prints values to the in-game Console for inspection and debugging.*

**See Also:** Getting Started → Using the Docs & Editor; Core JavaScript → Error Handling & Debugging  
**Keywords:** `console.log`, `log`, `console`, `debug`, `output`

### **console.log()**
*Function that prints values to the in-game Console for inspection and debugging.*

**See Also:** Getting Started → Using the Docs & Editor; Core JavaScript → Error Handling & Debugging  
**Keywords:** `console.log`, `log`, `console`, `debug`, `output`

### **Hotbar**
*Quick-access slots where saved spells can be bound for immediate casting during gameplay.*

**See Also:** Getting Started → Using the Docs & Editor  
**Keywords:** `hotbar`, `save`, `spells`

---

## Spell System

### **Element**
*The elemental archetype (Fire, Ice, Spark, etc.) associated with a spell. Determines available APIs and visual effects.*

**See Also:** Spell APIs section  
**Keywords:** `fire`, `ice`, `spark`, `element`

### **Spell API**
*Library of functions exposed for each element or support toolkit, enabling interaction with the Dreamscape.*

**See Also:** Spell APIs overview  
**Keywords:** `api`, `fire`, `ice`, `spark`, `utility`

### **Empowered**
*Indicates a spell is currently boosted by a status effect (e.g., Ember Heart). Often multiplies damage or adds extra effects.*

**See Also:** Spell APIs → Fire Spell API  
**Keywords:** `empowered`, `buff`, `ember-heart`

### **Mana Cost**
*Resource expenditure required to cast a spell. Calculated dynamically in many API examples.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `mana`, `cost`, `cooldown`

### **String**
*A sequence of characters representing text. One of JavaScript's primitive data types, written with quotes like `"hello"`.*

**See Also:** Core JavaScript → Data Types & Collections; Core JavaScript → Syntax & Variables  
**Keywords:** `string`, `text`, `characters`, `quotes`, `template literals`

### **Number**
*JavaScript's single numeric type handling both integers and floating-point values for calculations, damage, coordinates, and durations.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `number`, `integer`, `float`, `math`, `calculation`, `damage`, `coordinates`

### **Boolean**
*True/false values that control spell behavior, track status effects, and manage conditional logic.*

**See Also:** Core JavaScript → Data Types & Collections; Core JavaScript → Control Flow  
**Keywords:** `boolean`, `true`, `false`, `conditional`, `logic`, `status`

### **Object**
*Key-value collections that organize related data into logical groups. Essential for spell configurations and entity properties.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `object`, `key-value`, `properties`, `configuration`, `destructuring`, `spread`

### **Array**
*Ordered lists of values that maintain sequence and provide indexed access. Perfect for managing multiple projectiles, spell sequences, or element lists.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `array`, `list`, `index`, `iteration`, `map`, `filter`, `reduce`

### **null**
*Explicit empty value representing intentional absence of data. Different from `undefined` which means "not set".*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `null`, `empty`, `absence`, `undefined`

### **undefined**
*Value indicating a variable or property hasn't been assigned. Different from `null` which is an intentional empty value.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `undefined`, `unassigned`, `missing`, `null`

### **NaN**
*"Not a Number" value resulting from invalid mathematical operations. Propagates through calculations and requires special checking.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `nan`, `not a number`, `invalid`, `calculation`, `isNaN`

### **Map**
*Collection that stores key-value pairs with any type of key. Preserves insertion order and provides O(1) average access time.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `map`, `key-value`, `collection`, `performance`

### **Set**
*Collection that stores unique values only. Automatically handles uniqueness and provides O(1) average access time.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `set`, `unique`, `collection`, `duplicates`

### **WeakMap**
*Map-like collection that doesn't prevent garbage collection of keys. Useful for private data associated with objects.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `weakmap`, `private`, `garbage collection`, `memory`

### **WeakSet**
*Set-like collection that doesn't prevent garbage collection of values. Useful for tracking object references.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `weakset`, `references`, `garbage collection`, `memory`

### **Type Checking**
*Techniques to verify data types and validate spell parameters before execution. Prevents runtime errors.*

**See Also:** Core JavaScript → Data Types & Collections; Core JavaScript → Error Handling & Debugging  
**Keywords:** `type checking`, `validation`, `typeof`, `instanceof`, `runtime errors`

### **Destructuring**
*JavaScript syntax for extracting values from objects or arrays into individual variables. Makes code cleaner and more readable.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `destructuring`, `extract`, `variables`, `clean code`

### **Spread Syntax**
*JavaScript syntax (`...`) for expanding arrays or objects. Used for copying, merging, and passing multiple arguments.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `spread`, `expand`, `copy`, `merge`, `arguments`

### **Optional Chaining**
*JavaScript operator (`?.`) for safely accessing object properties that might be `null` or `undefined`. Prevents runtime errors.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `optional chaining`, `safe access`, `null`, `undefined`, `runtime errors`

### **Nullish Coalescing**
*JavaScript operator (`??`) for providing default values when a variable is `null` or `undefined`. More precise than `||` operator.*

**See Also:** Core JavaScript → Data Types & Collections  
**Keywords:** `nullish coalescing`, `default values`, `null`, `undefined`

### **Arithmetic Operators**
*Mathematical operators (`+`, `-`, `*`, `/`, `%`, `**`) that perform calculations on numeric values for spell damage, mana costs, and coordinates.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `arithmetic`, `math`, `addition`, `subtraction`, `multiplication`, `division`, `modulo`, `exponentiation`

### **Comparison Operators**
*Operators (`==`, `===`, `!=`, `!==`, `<`, `>`, `<=`, `>=`) that compare values and return boolean results for spell conditions and validation.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `comparison`, `equality`, `inequality`, `greater than`, `less than`, `strict equality`

### **Logical Operators**
*Operators (`&&`, `||`, `!`) that combine boolean values and conditions to create complex spell logic and decision trees.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `logical`, `and`, `or`, `not`, `boolean`, `conditions`, `short-circuit`

### **Assignment Operators**
*Operators (`=`, `+=`, `-=`, `*=`, `/=`, `%=`) that assign values to variables and can perform calculations during assignment.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `assignment`, `compound assignment`, `increment`, `decrement`, `update`

### **Ternary Operator**
*Conditional operator (`? :`) that returns one of two values based on a condition, perfect for dynamic spell effects.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `ternary`, `conditional`, `if-else`, `dynamic`, `conditional assignment`

### **Unary Operators**
*Operators (`++`, `--`, `!`, `typeof`, `+`, `-`) that work on a single value for increment/decrement, type checking, and negation.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `unary`, `increment`, `decrement`, `type checking`, `negation`, `typeof`

### **Operator Precedence**
*Rules that determine the order in which operators are evaluated when multiple operators appear in the same expression.*

**See Also:** Core JavaScript → Operators & Expressions  
**Keywords:** `precedence`, `order of operations`, `parentheses`, `evaluation order`

### **Type Coercion**
*JavaScript's automatic conversion of values from one type to another during operations, which can cause unexpected results.*

**See Also:** Core JavaScript → Operators & Expressions; Core JavaScript → Data Types & Collections  
**Keywords:** `type coercion`, `automatic conversion`, `implicit conversion`, `string concatenation`

---

## Gameplay Integration

### **Event**
*Trigger emitted by the game (e.g., `onCast`, `onHit`) that scripts can listen to for reactive behavior.*

**See Also:** Gameplay Integrations → Events & Triggers  
**Keywords:** `events`, `triggers`, `onCast`, `onHit`

### **Entity**
*Any interactive object in the world: player, enemy, projectile, or environmental object.*

**See Also:** Gameplay Integrations → Game Entities  
**Keywords:** `entity`, `player`, `enemy`, `projectile`

### **State**
*Persistent data your spell stores across casts or frames. Managed via helper APIs in Gameplay Integrations.*

**See Also:** Gameplay Integrations → State Management  
**Keywords:** `state`, `persistent`, `storage`

### **Performance**
*Guidelines and metrics to keep spells efficient, preventing frame drops or unintended slowdowns.*

**See Also:** Gameplay Integrations → Performance Tips  
**Keywords:** `performance`, `optimization`

---

## Reference & Support

### **Troubleshooting**
*Strategies and known fixes for common runtime issues or console errors.*

**See Also:** Reference & Glossary → Troubleshooting  
**Keywords:** `errors`, `fix`, `issues`

### **Changelog**
*Timeline of documentation updates and new API releases.*

**See Also:** Reference & Glossary → Changelog  
**Keywords:** `updates`, `release`, `changes`

---

Jump back to the documentation sections referenced above whenever you need deeper dives. As more topics are added, this glossary—and the search suggestions—will grow alongside them.
