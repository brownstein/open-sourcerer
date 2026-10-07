/**
 * Behavior: Casts a ring of sparks and moves
 * them while the player aims the spell, then
 * casts Fire from each of them at the target.
 */

// Pull in module dependencies.
const Fire = require("fire");
const Spark = require("spark");
const wait = require("wait");
const aim = require("aim");

// We'll store the Sparks in an array.
const sparks = [];

// Create 8 sparks.
for (let i = 0; i < 8; i++) {
  if (!sparks.length) {
    sparks.push(new Spark({
      mana: 40
    }));
    continue;
  }
  sparks.push(sparks[0].cast(Spark, { mana: 5 }));
}

// Declare a variable representing the number of times we've
// called rotateSparks.
let t = 0;

// Declare a function which rotates the sparks around the player.
function rotateSparks() {
  t += 0.1;
  for (let i = 0; i < sparks.length; i++) {
    const x = Math.cos(t + i * Math.PI / 4);
    const y = 1 + Math.sin(t + i * Math.PI / 4);
    sparks[i].setOffset({
      x,
      y
    });
  }
}

// Declare a variable representing the aimed spell position.
var aimVector = null;

// Asynchronously aim and assign the result to aimVector.
aim.asyncRelative().then((res => {
  aimVector = res;
}))

// Declare an async function which loops, without blocking
// the event loop, until aimVector is assigned, then fires
// a Fireball from all sparks simultaneously.
async function waitAndFire() {
  while (!aimVector) {
    rotateSparks();
    await wait.async(10);
  }
  aimVector.scale(20 / aimVector.length());
  await Promise.all(sparks.map(s => s.castAsync(Fire, {
    velocity: aimVector,
    // Fire costs 5 + strength mana, so cap strength to
    // what the Spark can actually afford.
    strength: Math.max(0, s.extra.mana - 5)
  })));
}

// Invoke the async function.
waitAndFire();