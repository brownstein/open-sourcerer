# Functions & Scope

Functions are like magical recipes in your spell book—they're reusable instructions that take ingredients (inputs), perform some magic (processing), and produce a result (output). Just like how a recipe for "Heal Potion" can be used many times with different ingredients, functions let you write code once and use it repeatedly.

## What are Functions?

Functions are reusable blocks of code that:
- Accept input values (parameters)
- Execute a sequence of statements (function body)
- Return a computed result (return value)

**Structure:**
- **Function name** - Identifier used to call the function
- **Parameters** - Input variables passed to the function
- **Function body** - Code that processes the inputs
- **Return value** - Output sent back to the caller

## Why Functions Matter

Functions are essential because they help you:

1. **Avoid Repetition** - Write code once, use it many times
2. **Organize Your Code** - Break complex problems into smaller, manageable pieces
3. **Make Code Readable** - Give meaningful names to chunks of logic
4. **Test and Debug** - Isolate problems to specific functions
5. **Reuse Logic** - Share code between different parts of your program

## Understanding Scope

Scope is like **visibility rules** for your variables. It determines where your variables can be "seen" and used. Think of it like different rooms in a house:
- **Global Scope** = The living room (everyone can see what's there)
- **Function Scope** = Individual bedrooms (only that function can see its variables)
- **Block Scope** = Closets (very limited visibility)

## The Building Blocks

Functions and scope work together to create organized, maintainable code. Don't worry if these concepts seem overwhelming—we'll explain each one step by step with plenty of examples.

---

## Overview

| Concept | Quick Example | When You’ll Use It |
| --- | --- | --- |
| [Function Declarations vs Expressions](#Function%20Declarations%20vs%20Expressions) | `function f(){}` vs `var f = function(){}` | Organize callable logic |
| [Parameters and Arguments](#Parameters%20and%20Arguments) | manual defaults | Flexible inputs |
| [Return Values](#Return%20Values) | `return result;` | Send results back to caller |
| [Scope: Global, Function, Block](#Scope:%20Global,%20Function,%20Block) | `var` scope | Avoid leaks and name clashes |
| [Closures](#Closures) | function returns function | Save state between calls |
| [The this Context](#The%20this%20Context) | `.call(obj, ...)` | Control method receiver |
| [Hoisting](#Hoisting) | call before/after | Understand declaration timing |
| [IIFE and Module Pattern](#IIFE%20and%20Module%20Pattern) | `(function(){ ... })()` | Encapsulate private state |
| [Pure vs Impure Functions](#Pure%20vs%20Impure%20Functions) | predictable vs side-effects | Testable spell math |
| [Error Handling in Functions](#Error%20Handling%20in%20Functions) | `try { } catch(e){ }` | Resilient spell code |

Clicking an item will smooth-scroll to the section and briefly highlight it (matching other subtabs).

---

## Function Declarations vs Expressions

**What it is:**
There are two main ways to create functions in JavaScript, like having two different ways to write down a recipe:

1. **Function Declaration** - Like writing a recipe in your cookbook
2. **Function Expression** - Like writing a recipe on a sticky note and putting it in a box

**Why it matters:**
Understanding the difference helps you:
- Know when you can use a function (timing matters!)
- Choose the right approach for your situation
- Avoid common timing-related bugs
- Write more flexible and reusable code

**Real-World Analogy:**
Think of function declarations like **permanent signs** in a store:
- They're put up before the store opens (hoisted)
- Everyone can see them immediately
- They're meant to be there permanently

Function expressions are like **temporary labels** you write and put in a drawer:
- They only exist when you create them
- You have to take them out of the drawer to use them
- They're more flexible—you can move them around

---

### Function Declarations

**What it is:**
A function declaration is like announcing "I have a function called X" at the top of your code. JavaScript processes these declarations before your code actually runs.

**The Basic Structure:**
```js
function functionName(parameters) {
  // Function body - what the function does
  return result;
}
```

**Key Characteristics:**
- **Hoisted** - Available throughout the entire scope, even before they're defined
- **Named** - Always has a name
- **Permanent** - Intended to be a permanent part of your code

**Step-by-Step Breakdown:**
1. **`function`** - Tells JavaScript "I'm creating a function"
2. **`functionName`** - The name you'll use to call the function
3. **`(parameters)`** - Optional inputs the function needs
4. **`{ ... }`** - The function body where the magic happens
5. **`return`** - Optional, sends a value back to the caller

**Try in code editor (A): Basic declaration**
```js
function calculateDamage(baseDamage, multiplier) {
  console.log("Calculating damage with base:", baseDamage, "and multiplier:", multiplier);
  var totalDamage = baseDamage * multiplier;
  console.log("Total damage calculated:", totalDamage);
  return totalDamage;
}

var playerDamage = calculateDamage(25, 1.5);
console.log("Player deals", playerDamage, "damage");
```

**Try in code editor (B): Multiple declarations**
```js
function healPlayer(currentHp, healAmount) {
  console.log("Healing player from", currentHp, "HP");
  var newHp = currentHp + healAmount;
  console.log("Player now has", newHp, "HP");
  return newHp;
}

function checkIfAlive(hp) {
  if (hp > 0) {
    console.log("Player is alive");
    return true;
  } else {
    console.log("Player is dead");
    return false;
  }
}

var playerHp = 30;
var healedHp = healPlayer(playerHp, 20);
var isAlive = checkIfAlive(healedHp);
console.log("Is player alive?", isAlive);
```

---

### Function Expressions

**What it is:**
A function expression is like creating a function and immediately putting it in a variable. It's more flexible because you can treat the function like any other value.

**The Basic Structure:**
```js
var functionName = function(parameters) {
  // Function body
  return result;
};
```

**Key Characteristics:**
- **Not hoisted** - Only available after the line where it's defined
- **Anonymous** - The function itself doesn't have a name (the variable does)
- **Flexible** - Can be assigned, passed around, or reassigned

**Step-by-Step Breakdown:**
1. **`var functionName`** - Create a variable to hold the function
2. **`= function`** - Assign a function to that variable
3. **`(parameters)`** - Optional inputs
4. **`{ ... }`** - Function body
5. **`;`** - End the assignment statement

**Try in code editor (A): Basic expression**
```js
var calculateExperience = function(currentExp, gainedExp) {
  console.log("Adding", gainedExp, "experience to current", currentExp);
  var newExp = currentExp + gainedExp;
  console.log("New experience total:", newExp);
  return newExp;
};

var playerExp = 150;
var newExp = calculateExperience(playerExp, 50);
console.log("Player now has", newExp, "experience");
```

**Try in code editor (B): Reassigning functions**
```js
var spellFunction = function(element) {
  return "Casting " + element + " spell";
};

console.log(spellFunction("fire"));

// Reassign to a different function
spellFunction = function(element) {
  return "Enhanced " + element + " spell with bonus damage";
};

console.log(spellFunction("ice"));
```

---

### When to Use Each

| Type | Use When | Example |
|------|----------|---------|
| **Declaration** | Main functions, utilities, reusable code | `function healPlayer() { ... }` |
| **Expression** | One-time use, conditional functions, callbacks | `var temp = function() { ... }` |

**Common Mistakes to Avoid:**
- **Trying to use expressions before they're defined** - Remember, they're not hoisted!
  ```js
  // WRONG - This will cause an error
  console.log(myFunction(5)); // Error: myFunction is not a function
  var myFunction = function(x) { return x * 2; };
  
  // CORRECT - Use after definition
  var myFunction = function(x) { return x * 2; };
  console.log(myFunction(5)); // Works fine
  ```
- **Shadowing function names** - Don't use the same name for variables and functions
- **Forgetting the semicolon** - Function expressions need semicolons

**Learning Tips:**
- **Start with declarations** - They're simpler and more forgiving
- **Use expressions when you need flexibility** - Passing functions as arguments, conditional functions
- **Always test your functions** - Make sure they work before using them
- **Use meaningful names** - Both for the function and the variable holding it

---

## Parameters and Arguments

**What it is:**
Parameters and arguments are like the **ingredients** and **actual ingredients** for a recipe:
- **Parameters** = The ingredient list in the recipe (what the function expects)
- **Arguments** = The actual ingredients you use when cooking (what you pass to the function)

**Why it matters:**
Understanding parameters and arguments helps you:
- Create flexible functions that work with different inputs
- Handle missing or invalid data gracefully
- Write functions that are safe and predictable
- Debug problems when functions don't work as expected

**Real-World Analogy:**
Think of a pizza-making function:
- **Parameters** = The recipe says "dough, sauce, cheese, toppings"
- **Arguments** = You actually use "thin crust, marinara, mozzarella, pepperoni"
- **Default values** = If you don't have pepperoni, you use "whatever's available"

---

### Understanding the Difference

**Parameters** are the **placeholders** in your function definition:
```js
function makePizza(dough, sauce, cheese) {
  // dough, sauce, cheese are parameters
}
```

**Arguments** are the **actual values** you pass when calling the function:
```js
makePizza("thin crust", "marinara", "mozzarella");
// "thin crust", "marinara", "mozzarella" are arguments
```

**Try in code editor (A): Basic parameters and arguments**
```js
function createSpell(spellName, damage, manaCost) {
  console.log("Creating spell:", spellName);
  console.log("Damage:", damage);
  console.log("Mana cost:", manaCost);
  
  var spell = {
    name: spellName,
    damage: damage,
    cost: manaCost,
    description: spellName + " deals " + damage + " damage for " + manaCost + " mana"
  };
  
  return spell;
}

var fireball = createSpell("Fireball", 25, 10);
var heal = createSpell("Heal", 0, 5);
console.log("Created spells:", fireball.description, heal.description);
```

---

### Handling Missing Arguments

In JavaScript, if you don't provide enough arguments, the missing ones become `undefined`. This can cause problems, so it's important to handle missing arguments gracefully.

**Try in code editor (A): Manual defaulting**
```js
function calculateDamage(baseDamage, multiplier, bonus) {
  console.log("Inputs - baseDamage:", baseDamage, "multiplier:", multiplier, "bonus:", bonus);
  
  // Handle missing arguments with manual defaults
  if (baseDamage == null) {
    console.log("No base damage provided, using default 10");
    baseDamage = 10;
  }
  
  if (multiplier == null) {
    console.log("No multiplier provided, using default 1.0");
    multiplier = 1.0;
  }
  
  if (bonus == null) {
    console.log("No bonus provided, using default 0");
    bonus = 0;
  }
  
  var totalDamage = (baseDamage * multiplier) + bonus;
  console.log("Calculated total damage:", totalDamage);
  return totalDamage;
}

// Test with different argument combinations
console.log("=== Test 1: All arguments ===");
calculateDamage(20, 1.5, 5);

console.log("\n=== Test 2: Missing bonus ===");
calculateDamage(20, 1.5);

console.log("\n=== Test 3: Only base damage ===");
calculateDamage(20);

console.log("\n=== Test 4: No arguments ===");
calculateDamage();
```

**Try in code editor (B): Argument validation**
```js
function processPlayerData(name, level, hp, mana) {
  console.log("Processing player data...");
  
  // Check if we have the required arguments
  if (arguments.length < 2) {
    console.log("Error: Need at least name and level");
    return null;
  }
  
  // Validate each argument
  if (typeof name !== "string" || name.length === 0) {
    console.log("Error: Name must be a non-empty string");
    return null;
  }
  
  if (typeof level !== "number" || level < 1) {
    console.log("Error: Level must be a positive number");
    return null;
  }
  
  // Set defaults for optional arguments
  if (hp == null) {
    console.log("No HP provided, using default 100");
    hp = 100;
  }
  
  if (mana == null) {
    console.log("No mana provided, using default 50");
    mana = 50;
  }
  
  var player = {
    name: name,
    level: level,
    hp: hp,
    mana: mana,
    status: "active"
  };
  
  console.log("Player created successfully:", player.name, "Level", player.level);
  return player;
}

// Test with various inputs
console.log("=== Valid player ===");
var player1 = processPlayerData("Hero", 25, 150, 75);

console.log("\n=== Missing optional args ===");
var player2 = processPlayerData("Mage", 15);

console.log("\n=== Invalid inputs ===");
var player3 = processPlayerData("", 10);
var player4 = processPlayerData("Warrior", -5);
```

---

### Using the `arguments` Object

JavaScript provides a special `arguments` object that contains all the arguments passed to a function, even if you don't define parameters for them.

**Try in code editor (A): Working with arguments object**
```js
function flexibleSum() {
  console.log("Number of arguments received:", arguments.length);
  console.log("All arguments:", arguments);
  
  var total = 0;
  for (var i = 0; i < arguments.length; i++) {
    console.log("Adding argument", i, ":", arguments[i]);
    total = total + arguments[i];
  }
  
  console.log("Total sum:", total);
  return total;
}

// Test with different numbers of arguments
console.log("=== Sum of 3 numbers ===");
flexibleSum(5, 10, 15);

console.log("\n=== Sum of 5 numbers ===");
flexibleSum(1, 2, 3, 4, 5);

console.log("\n=== Sum of 1 number ===");
flexibleSum(42);
```

**Try in code editor (B): Type checking with arguments**
```js
function validateSpellArguments() {
  console.log("Validating spell arguments...");
  
  // Check if we have any arguments
  if (arguments.length === 0) {
    console.log("Error: No arguments provided");
    return false;
  }
  
  // Check each argument
  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i];
    console.log("Checking argument", i, ":", arg, "Type:", typeof arg);
    
    if (typeof arg !== "string" && typeof arg !== "number") {
      console.log("Error: Argument", i, "must be a string or number");
      return false;
    }
    
    if (typeof arg === "string" && arg.length === 0) {
      console.log("Error: String argument", i, "cannot be empty");
      return false;
    }
    
    if (typeof arg === "number" && arg < 0) {
      console.log("Error: Number argument", i, "cannot be negative");
      return false;
    }
  }
  
  console.log("All arguments are valid!");
  return true;
}

// Test with various argument combinations
console.log("=== Valid arguments ===");
validateSpellArguments("Fireball", 25, "fire");

console.log("\n=== Invalid arguments ===");
validateSpellArguments("", 25, "fire");
validateSpellArguments("Fireball", -5, "fire");
validateSpellArguments("Fireball", 25, null);
```

---

### Best Practices

**1. Always Validate Inputs**
```js
function safeFunction(param1, param2) {
  // Check if parameters exist
  if (param1 == null) {
    console.log("Warning: param1 is missing");
    param1 = "default value";
  }
  
  // Check parameter types
  if (typeof param2 !== "number") {
    console.log("Error: param2 must be a number");
    return null;
  }
  
  // Use the parameters safely
  return param1 + " " + param2;
}
```

**2. Use Meaningful Parameter Names**
```js
// GOOD - Clear what each parameter does
function calculateSpellDamage(baseDamage, elementMultiplier, criticalHitBonus) {
  // ...
}

// BAD - Unclear what parameters are for
function calc(a, b, c) {
  // ...
}
```

**3. Document Your Parameters**
```js
function healPlayer(currentHp, healAmount) {
  // currentHp: number - Player's current health points
  // healAmount: number - Amount of health to restore
  // Returns: number - New health total
  
  if (currentHp == null || healAmount == null) {
    console.log("Error: Both parameters are required");
    return null;
  }
  
  return currentHp + healAmount;
}
```

**Common Mistakes to Avoid:**
- **Not checking for missing arguments** - Always validate your inputs
- **Assuming argument types** - Check types before using them
- **Using `arguments` when parameters would be clearer** - Prefer explicit parameters when possible
- **Not providing defaults** - Handle missing arguments gracefully

**Learning Tips:**
- **Start with simple functions** - One or two parameters at first
- **Always test edge cases** - What happens with no arguments? Wrong types?
- **Use console.log liberally** - See what your function receives
- **Practice validation** - Get in the habit of checking inputs

---

## Return Values

**What it is:**
Return values are like the **finished product** that comes out of a factory. Your function does some work (processing) and then sends back a result (return value) to whoever called it.

**Why it matters:**
Return values are essential because they:
- **Enable composition** - You can use the result of one function as input for another
- **Make functions reusable** - The caller gets useful data back
- **Allow testing** - You can check if functions work correctly by examining their return values
- **Create data flow** - Information flows through your program via return values

**Real-World Analogy:**
Think of a function like a **vending machine**:
- You put in money (arguments)
- The machine processes your request (function body)
- It gives you a snack (return value)
- Without the snack, the vending machine would be useless!

---

### Understanding Return Values

**Every function returns something:**
- If you use `return value`, it returns that value
- If you don't use `return`, it returns `undefined`
- You can only return **one value** at a time

**Try in code editor (A): Basic return values**
```js
function calculateSpellDamage(baseDamage, elementMultiplier) {
  console.log("Calculating spell damage...");
  console.log("Base damage:", baseDamage);
  console.log("Element multiplier:", elementMultiplier);
  
  var totalDamage = baseDamage * elementMultiplier;
  console.log("Total damage calculated:", totalDamage);
  
  return totalDamage; // This sends the result back to the caller
}

function createDamageReport(damage) {
  console.log("Creating damage report...");
  var report = "Spell deals " + damage + " damage";
  console.log("Report created:", report);
  return report;
}

// Use the return values
var spellDamage = calculateSpellDamage(20, 1.5);
console.log("Spell damage result:", spellDamage);

var report = createDamageReport(spellDamage);
console.log("Final report:", report);
```

**Try in code editor (B): Functions without return**
```js
function logPlayerInfo(name, level) {
  console.log("Player name:", name);
  console.log("Player level:", level);
  console.log("Logging complete");
  // No return statement - this function returns undefined
}

function calculateAndLog(x, y) {
  var result = x + y;
  console.log("Calculation result:", result);
  // No return statement - this function returns undefined
}

var logResult = logPlayerInfo("Hero", 25);
console.log("Log function returned:", logResult);

var calcResult = calculateAndLog(5, 10);
console.log("Calc function returned:", calcResult);
```

---

### Early Returns and Guard Clauses

Sometimes you want to exit a function early if something goes wrong. This is called an "early return" and is very useful for handling errors or invalid inputs.

**Try in code editor (A): Early returns for validation**
```js
function safeDivide(a, b) {
  console.log("Attempting to divide", a, "by", b);
  
  // Early return if inputs are invalid
  if (typeof a !== "number" || typeof b !== "number") {
    console.log("Error: Both inputs must be numbers");
    return null; // Exit early with error indicator
  }
  
  // Early return if dividing by zero
  if (b === 0) {
    console.log("Error: Cannot divide by zero");
    return null; // Exit early with error indicator
  }
  
  // If we get here, the inputs are valid
  var result = a / b;
  console.log("Division successful:", result);
  return result;
}

// Test the function with various inputs
console.log("=== Valid division ===");
var result1 = safeDivide(10, 2);
console.log("Result:", result1);

console.log("\n=== Division by zero ===");
var result2 = safeDivide(10, 0);
console.log("Result:", result2);

console.log("\n=== Invalid inputs ===");
var result3 = safeDivide("hello", 2);
console.log("Result:", result3);
```

**Try in code editor (B): Multiple return paths**
```js
function processPlayerAction(action, player) {
  console.log("Processing action:", action, "for player:", player.name);
  
  // Early return if player is dead
  if (player.hp <= 0) {
    console.log("Player is dead, cannot perform actions");
    return { success: false, message: "Player is dead" };
  }
  
  // Early return if player has no mana for spell actions
  if (action.type === "spell" && player.mana < action.cost) {
    console.log("Not enough mana for spell");
    return { success: false, message: "Not enough mana" };
  }
  
  // Process the action based on type
  if (action.type === "attack") {
    console.log("Player attacks for", action.damage, "damage");
    return { success: true, damage: action.damage, message: "Attack successful" };
  }
  
  if (action.type === "spell") {
    console.log("Player casts", action.name, "spell");
    player.mana = player.mana - action.cost;
    return { success: true, manaUsed: action.cost, message: "Spell cast successfully" };
  }
  
  if (action.type === "heal") {
    var healAmount = Math.min(action.healAmount, 100 - player.hp);
    player.hp = player.hp + healAmount;
    console.log("Player healed for", healAmount, "HP");
    return { success: true, healAmount: healAmount, message: "Healing successful" };
  }
  
  // Default case - unknown action
  console.log("Unknown action type");
  return { success: false, message: "Unknown action" };
}

// Test with different scenarios
var player = { name: "Hero", hp: 50, mana: 30 };

console.log("=== Valid attack ===");
var attackAction = { type: "attack", damage: 15 };
var result1 = processPlayerAction(attackAction, player);

console.log("\n=== Valid spell ===");
var spellAction = { type: "spell", name: "Fireball", cost: 10 };
var result2 = processPlayerAction(spellAction, player);

console.log("\n=== Valid heal ===");
var healAction = { type: "heal", healAmount: 25 };
var result3 = processPlayerAction(healAction, player);

console.log("\n=== Invalid spell (no mana) ===");
var expensiveSpell = { type: "spell", name: "Meteor", cost: 50 };
var result4 = processPlayerAction(expensiveSpell, player);
```

---

### Returning Complex Data

Functions can return more than just simple numbers or strings. They can return objects, arrays, or even other functions!

**Try in code editor (A): Returning objects**
```js
function createSpell(name, damage, manaCost, element) {
  console.log("Creating spell:", name);
  
  var spell = {
    name: name,
    damage: damage,
    manaCost: manaCost,
    element: element,
    description: name + " deals " + damage + " " + element + " damage for " + manaCost + " mana",
    isUsable: function(playerMana) {
      return playerMana >= manaCost;
    }
  };
  
  console.log("Spell created successfully");
  return spell;
}

function createPlayer(name, level) {
  console.log("Creating player:", name);
  
  var player = {
    name: name,
    level: level,
    hp: 100,
    mana: 50,
    spells: [],
    addSpell: function(spell) {
      this.spells.push(spell);
      console.log("Added spell:", spell.name);
    },
    canCastSpell: function(spell) {
      return this.mana >= spell.manaCost;
    }
  };
  
  console.log("Player created successfully");
  return player;
}

// Create spells and player
var fireball = createSpell("Fireball", 25, 10, "fire");
var heal = createSpell("Heal", 0, 5, "holy");

var player = createPlayer("Mage", 20);
player.addSpell(fireball);
player.addSpell(heal);

console.log("Player spells:", player.spells.length);
console.log("Can cast fireball?", player.canCastSpell(fireball));
console.log("Can cast heal?", player.canCastSpell(heal));
```

**Try in code editor (B): Returning arrays**
```js
function generateRandomNumbers(count, min, max) {
  console.log("Generating", count, "random numbers between", min, "and", max);
  
  var numbers = [];
  for (var i = 0; i < count; i++) {
    var randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    numbers.push(randomNum);
    console.log("Generated number", i + 1, ":", randomNum);
  }
  
  console.log("All numbers generated:", numbers);
  return numbers;
}

function analyzeNumbers(numbers) {
  console.log("Analyzing numbers:", numbers);
  
  var analysis = {
    count: numbers.length,
    sum: 0,
    average: 0,
    min: numbers[0],
    max: numbers[0],
    even: [],
    odd: []
  };
  
  for (var i = 0; i < numbers.length; i++) {
    var num = numbers[i];
    analysis.sum = analysis.sum + num;
    
    if (num < analysis.min) analysis.min = num;
    if (num > analysis.max) analysis.max = num;
    
    if (num % 2 === 0) {
      analysis.even.push(num);
    } else {
      analysis.odd.push(num);
    }
  }
  
  analysis.average = analysis.sum / analysis.count;
  
  console.log("Analysis complete");
  return analysis;
}

// Generate and analyze numbers
var randomNums = generateRandomNumbers(5, 1, 10);
var analysis = analyzeNumbers(randomNums);

console.log("Number analysis:");
console.log("Count:", analysis.count);
console.log("Sum:", analysis.sum);
console.log("Average:", analysis.average);
console.log("Min:", analysis.min);
console.log("Max:", analysis.max);
console.log("Even numbers:", analysis.even);
console.log("Odd numbers:", analysis.odd);
```

---

### Best Practices for Return Values

**1. Be Consistent**
```js
// GOOD - Always returns a number or null
function safeParseInt(str) {
  var result = parseInt(str);
  if (isNaN(result)) {
    return null;
  }
  return result;
}

// BAD - Sometimes returns number, sometimes string, sometimes undefined
function badParse(str) {
  if (str === "error") return "error";
  if (str === "") return undefined;
  return parseInt(str);
}
```

**2. Document What You Return**
```js
function calculateDamage(baseDamage, multiplier) {
  // Returns: number - The calculated damage amount
  // Returns: null - If inputs are invalid
  
  if (typeof baseDamage !== "number" || typeof multiplier !== "number") {
    return null;
  }
  
  return baseDamage * multiplier;
}
```

**3. Use Meaningful Return Values**
```js
// GOOD - Clear what the return value means
function checkPlayerStatus(player) {
  if (player.hp <= 0) return "dead";
  if (player.hp < 25) return "critical";
  if (player.hp < 75) return "injured";
  return "healthy";
}

// BAD - Unclear what the numbers mean
function badStatus(player) {
  if (player.hp <= 0) return 0;
  if (player.hp < 25) return 1;
  if (player.hp < 75) return 2;
  return 3;
}
```

**Common Mistakes to Avoid:**
- **Forgetting to return** - Functions without return statements return `undefined`
- **Returning different types** - Be consistent with what you return
- **Not handling the return value** - Always use what your function returns
- **Returning too much** - Keep return values simple and focused

**Learning Tips:**
- **Always think about what your function should return** - What does the caller need?
- **Test your return values** - Make sure they're what you expect
- **Use early returns** - Exit early when something goes wrong
- **Be consistent** - Return the same type of value in all cases

---

## Scope: Global, Function, Block

**What it is:**
Scope is like **visibility rules** for your variables—it determines where your variables can be "seen" and used in your code. Think of it like different rooms in a house with different privacy levels.

**Why it matters:**
Understanding scope helps you:
- **Avoid naming conflicts** - Variables with the same name won't interfere with each other
- **Control access** - Keep some variables private to specific functions
- **Debug problems** - Know where variables are available
- **Write better code** - Organize your variables logically

**Real-World Analogy:**
Think of scope like **different areas in a school**:
- **Global Scope** = The main hallway (everyone can see what's posted there)
- **Function Scope** = Individual classrooms (only students in that class can see the board)
- **Block Scope** = Lockers (only the person with the key can see inside)

---

### Global Scope

**What it is:**
Global scope is like the **main hallway** of your program. Variables declared here can be seen and used from anywhere in your code.

**Key Characteristics:**
- Variables are accessible from anywhere
- Can be modified from any function
- Can cause naming conflicts
- Should be used sparingly

**Try in code editor (A): Global variables**
```js
// These variables are in global scope
var playerName = "Hero";
var playerLevel = 25;
var gameScore = 0;

function displayPlayerInfo() {
  console.log("Player:", playerName, "Level:", playerLevel);
  console.log("Score:", gameScore);
}

function updateScore(points) {
  console.log("Adding", points, "points to score");
  gameScore = gameScore + points; // Modifying global variable
  console.log("New score:", gameScore);
}

function levelUp() {
  console.log("Leveling up player");
  playerLevel = playerLevel + 1; // Modifying global variable
  console.log("New level:", playerLevel);
}

// All functions can access and modify global variables
displayPlayerInfo();
updateScore(100);
levelUp();
displayPlayerInfo();
```

**Try in code editor (B): Global scope problems**
```js
var counter = 0; // Global variable

function incrementCounter() {
  console.log("Incrementing counter from", counter);
  counter = counter + 1;
  console.log("Counter is now", counter);
}

function resetCounter() {
  console.log("Resetting counter from", counter);
  counter = 0;
  console.log("Counter reset to", counter);
}

function processItems() {
  var counter = 0; // This creates a NEW local variable with same name
  console.log("Processing items...");
  
  for (var i = 0; i < 3; i++) {
    counter = counter + 1;
    console.log("Local counter:", counter);
  }
  
  console.log("Global counter is still:", window.counter || "undefined");
}

// Test the functions
incrementCounter();
incrementCounter();
processItems();
incrementCounter();
resetCounter();
```

---

### Function Scope

**What it is:**
Function scope means variables declared inside a function are only visible within that function. It's like having a private room where only that function can see its variables.

**Key Characteristics:**
- Variables are only accessible within the function
- Each function call gets its own copy of variables
- Variables are destroyed when the function ends
- Prevents naming conflicts between functions

**Try in code editor (A): Function scope isolation**
```js
function createPlayer() {
  var playerName = "Mage"; // Local to this function
  var playerHp = 100;      // Local to this function
  var playerMana = 50;     // Local to this function
  
  console.log("Created player:", playerName);
  console.log("HP:", playerHp, "Mana:", playerMana);
  
  return {
    name: playerName,
    hp: playerHp,
    mana: playerMana
  };
}

function createEnemy() {
  var enemyName = "Goblin"; // Local to this function (same name, different scope)
  var enemyHp = 50;         // Local to this function
  var enemyDamage = 15;     // Local to this function
  
  console.log("Created enemy:", enemyName);
  console.log("HP:", enemyHp, "Damage:", enemyDamage);
  
  return {
    name: enemyName,
    hp: enemyHp,
    damage: enemyDamage
  };
}

// Each function has its own variables
var player = createPlayer();
var enemy = createEnemy();

// These variables don't exist outside their functions
console.log("Player name:", player.name);
console.log("Enemy name:", enemy.name);
```

**Try in code editor (B): Function scope with parameters**
```js
function calculateDamage(attacker, defender) {
  var baseDamage = attacker.damage || 10;
  var defense = defender.defense || 0;
  var actualDamage = Math.max(1, baseDamage - defense);
  
  console.log("Attacker damage:", baseDamage);
  console.log("Defender defense:", defense);
  console.log("Actual damage dealt:", actualDamage);
  
  return actualDamage;
}

function applyDamage(target, damage) {
  var originalHp = target.hp;
  target.hp = Math.max(0, target.hp - damage);
  var damageDealt = originalHp - target.hp;
  
  console.log("Target original HP:", originalHp);
  console.log("Damage dealt:", damageDealt);
  console.log("Target remaining HP:", target.hp);
  
  return damageDealt;
}

// Test the functions
var attacker = { damage: 25 };
var defender = { hp: 100, defense: 5 };

var damage = calculateDamage(attacker, defender);
var actualDamage = applyDamage(defender, damage);
```

---

### Block Scope (Limited in ES5)

**What it is:**
In ES5, `var` is **not** block-scoped. Variables declared with `var` inside blocks (like `if` statements or `for` loops) are actually function-scoped, which can be confusing.

**Key Characteristics:**
- `var` variables are hoisted to the function scope
- Variables declared in blocks are accessible outside the block
- This can lead to unexpected behavior
- Use inner functions for true isolation

**Try in code editor (A): var is not block-scoped**
```js
function demonstrateVarScope() {
  console.log("Before if block - x:", typeof x); // undefined (hoisted)
  
  if (true) {
    var x = 10; // This is function-scoped, not block-scoped
    var y = 20;
    console.log("Inside if block - x:", x, "y:", y);
  }
  
  console.log("After if block - x:", x, "y:", y); // Still accessible!
  
  for (var i = 0; i < 3; i++) {
    var loopVar = "iteration " + i;
    console.log("Inside loop:", loopVar);
  }
  
  console.log("After loop - i:", i, "loopVar:", loopVar); // Still accessible!
}

demonstrateVarScope();
```

**Try in code editor (B): Using inner functions for isolation**
```js
function createIsolatedScope() {
  console.log("Creating isolated scopes...");
  
  // Use inner functions to create true isolation
  function createCounter() {
    var count = 0; // Truly private to this inner function
    
    return {
      increment: function() {
        count = count + 1;
        console.log("Counter incremented to:", count);
        return count;
      },
      getCount: function() {
        console.log("Current count:", count);
        return count;
      },
      reset: function() {
        count = 0;
        console.log("Counter reset to:", count);
        return count;
      }
    };
  }
  
  function createTimer() {
    var startTime = Date.now(); // Truly private to this inner function
    
    return {
      getElapsed: function() {
        var elapsed = Date.now() - startTime;
        console.log("Elapsed time:", elapsed, "ms");
        return elapsed;
      },
      reset: function() {
        startTime = Date.now();
        console.log("Timer reset");
        return startTime;
      }
    };
  }
  
  // Create isolated objects
  var counter1 = createCounter();
  var counter2 = createCounter();
  var timer = createTimer();
  
  // Each has its own private variables
  counter1.increment();
  counter1.increment();
  counter2.increment();
  timer.getElapsed();
  
  console.log("Counter1 count:", counter1.getCount());
  console.log("Counter2 count:", counter2.getCount());
}

createIsolatedScope();
```

---

### Scope Chain and Variable Lookup

**What it is:**
When JavaScript looks for a variable, it follows a **scope chain** - it looks in the current scope first, then moves outward to find the variable.

**The Lookup Process:**
1. Look in current function scope
2. Look in outer function scope
3. Look in global scope
4. If not found, return `undefined`

**Try in code editor (A): Scope chain demonstration**
```js
var globalVar = "I'm global";

function outerFunction() {
  var outerVar = "I'm in outer function";
  
  console.log("In outer function:");
  console.log("globalVar:", globalVar);
  console.log("outerVar:", outerVar);
  
  function innerFunction() {
    var innerVar = "I'm in inner function";
    
    console.log("In inner function:");
    console.log("globalVar:", globalVar);    // Found in global scope
    console.log("outerVar:", outerVar);      // Found in outer function scope
    console.log("innerVar:", innerVar);      // Found in current scope
  }
  
  innerFunction();
}

outerFunction();
```

**Try in code editor (B): Variable shadowing**
```js
var name = "Global Name";

function demonstrateShadowing() {
  var name = "Function Name"; // This shadows the global variable
  
  console.log("In function, name is:", name);
  
  function innerFunction() {
    var name = "Inner Name"; // This shadows the function variable
    
    console.log("In inner function, name is:", name);
    
    // Access outer scopes explicitly (not possible in ES5, but shown for understanding)
    console.log("We can't directly access outer scope variables with same name");
  }
  
  innerFunction();
  console.log("Back in function, name is:", name);
}

console.log("In global scope, name is:", name);
demonstrateShadowing();
console.log("Back in global scope, name is:", name);
```

---

### Best Practices for Scope

**1. Minimize Global Variables**
```js
// BAD - Too many global variables
var playerName = "Hero";
var playerHp = 100;
var playerMana = 50;
var playerLevel = 1;
var playerExp = 0;

// GOOD - Use an object to group related variables
var player = {
  name: "Hero",
  hp: 100,
  mana: 50,
  level: 1,
  exp: 0
};
```

**2. Use Meaningful Variable Names**
```js
// BAD - Unclear what these variables are for
var x, y, z;

// GOOD - Clear purpose
var playerX, playerY, playerZ;
```

**3. Keep Functions Focused**
```js
// BAD - Function does too much and uses many variables
function processGame() {
  var player = createPlayer();
  var enemies = createEnemies();
  var items = createItems();
  var spells = createSpells();
  // ... hundreds of lines
}

// GOOD - Small, focused functions
function createPlayer() { /* ... */ }
function createEnemies() { /* ... */ }
function createItems() { /* ... */ }
function createSpells() { /* ... */ }
```

**Common Mistakes to Avoid:**
- **Creating too many global variables** - Use objects to group related data
- **Not understanding var hoisting** - Variables are hoisted to function scope
- **Shadowing variables unintentionally** - Be careful with variable names
- **Not using inner functions for isolation** - Use them to create private scope

**Learning Tips:**
- **Start with simple scopes** - One function at a time
- **Use console.log to trace variables** - See where they're accessible
- **Practice with nested functions** - Understand the scope chain
- **Avoid global variables** - Keep your code organized

---

## Closures

**What it is:** A function remembers variables from the outer function where it was created.

**Why it matters:** Keep state across calls without global variables.

**How to use:** Return inner functions that capture needed values.

**Common Mistakes:**
- Capturing mutable objects and mutating them unexpectedly
- Sharing one closure across unrelated features
- Overusing closures where simple params suffice

**Try in code editor (A): counter**
```js
function makeCounter() {
  var n = 0;
  return function () { n = n + 1; return n; };
}
var c = makeCounter();
console.log(c(), c());
```

**Try in code editor (B): adder**
```js
function makeAdder(base) {
  return function (x) { return base + x; };
}
var add2 = makeAdder(2);
var add5 = makeAdder(5);
console.log(add2(3), add5(3));
```

---

## The this Context

**What it is:** The object a function is bound to when called as a method.

**Why it matters:** Affects which data your method reads/writes (like spell stats on an object).

**How to use:** Call as `obj.method()`; when detached, use `.call(obj, ...)` to set `this`.

**Common Mistakes:**
- Losing `this` by storing a method into a variable and calling it later
- Assuming arrow functions (not ES5) fix binding
- Forgetting `.call`/`.apply` when needed

**Try in code editor (A): method vs detached**
```js
var player = {
  name: "Sage",
  say: function (msg) { console.log(this.name + ":", msg); }
};
player.say("Hello");
var speak = player.say;
// Wrong context
speak("Oops");
// Fix with call
speak.call(player, "Fixed");
```

**Try in code editor (B): self = this**
```js
var obj = {
  value: 10,
  incLater: function () {
    var self = this;
    setTimeout(function () { self.value = self.value + 1; console.log("value:", self.value); }, 10);
  }
};
obj.incLater();
```

---

## Hoisting

**What it is:** How declarations are processed before code runs. Function declarations are hoisted; `var` is hoisted but initialized to `undefined`.

**Why it matters:** Explains why some calls work before their definition—and others don’t.

**How to use:** Prefer declare-before-use; rely on hoisting only for simple cases.

**Common Mistakes:**
- Calling function expressions before assignment
- Reading `var` before assignment expecting a value
- Assuming let/const behavior (not ES5)

**Try in code editor (A): function declaration hoisting**
```js
console.log(square(4));
function square(x) { return x * x; }
```

**Try in code editor (B): var hoisting pitfall**
```js
console.log(val); // undefined due to hoisting
var val = 10;
console.log(val); // 10 after assignment
```

---

## IIFE and Module Pattern

**What it is:** IIFE (Immediately-Invoked Function Expression) creates a private scope; simple module exposes a public API.

**Why it matters:** Encapsulates internal details while exposing controlled functions.

**How to use:** Return an object of methods from an IIFE or attach methods to a namespace object.

**Common Mistakes:**
- Leaking internals by returning mutable references directly
- Relying on globals inside the module
- Overcomplicating the public API

**Try in code editor (A): IIFE module**
```js
var CounterModule = (function () {
  var n = 0;
  return {
    inc: function () { n = n + 1; return n; },
    get: function () { return n; }
  };
})();
console.log(CounterModule.inc(), CounterModule.get());
```

**Try in code editor (B): namespace object**
```js
var MathUtil = {};
MathUtil.double = function (x) { return x * 2; };
MathUtil.clamp = function (x, min, max) { if (x < min) return min; if (x > max) return max; return x; };
console.log(MathUtil.double(6), MathUtil.clamp(12, 0, 10));
```

---

## Pure vs Impure Functions

**What it is:** Pure functions depend only on inputs and have no side-effects; impure ones touch external state.

**Why it matters:** Pure functions are predictable and easy to test; impure ones must be controlled.

**How to use:** Prefer pure for calculations; isolate side-effects behind small wrappers.

**Common Mistakes:**
- Hiding mutations inside helpers
- Relying on ambient globals for logic
- Mixing compute and side-effects in one function

**Try in code editor (A): pure function**
```js
function double(x) { return x * 2; }
console.log(double(4), double(4)); // same input -> same output
```

**Try in code editor (B): impure function**
```js
var counter = 0;
function increment() { counter = counter + 1; return counter; }
console.log(increment(), increment()); // external state changes
```

---

## Error Handling in Functions

**What it is:** Defensive coding inside functions using guards and try/catch.

**Why it matters:** Keeps spells robust when inputs are bad or data is missing.

**How to use:** Validate types first; use try/catch for risky parsing and I/O.

**Common Mistakes:**
- Catching but not logging
- Returning inconsistent types on error
- Using exceptions for normal branches

**Try in code editor (A): safeParse**
```js
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch (e) {
    console.log("Parse error:", e && e.message);
    return { ok: false };
  }
}
console.log(safeParse("{\"x\":1}"), safeParse("not json"));
```

**Try in code editor (B): safeDivide**
```js
function safeDivide(a, b) {
  if (typeof a !== "number" || typeof b !== "number") { console.log("Invalid types"); return null; }
  if (b === 0) { console.log("Divide by zero"); return null; }
  return a / b;
}
console.log("safeDivide:", safeDivide(10, 2), safeDivide(10, 0));
```

---

## Next Steps

- Continue to **Control Flow** to orchestrate when functions run.
- Revisit **Operators & Expressions** to compose function logic precisely.

By practicing small, focused examples, you’ll write functions that are predictable, reusable, and easy to debug in combat.
