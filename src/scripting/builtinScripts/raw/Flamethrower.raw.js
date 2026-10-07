/**
 * Behavior: Uses all available mana to project a flamethrower forwards.
 */

// Pull in module dependencies.
const Fire = require("fire");
const Spark = require("spark");
const Self = require("self");
const wait = require("wait");

// Determine the direction we want to move in.
const dx = Self.facingRight ? 1 : -1;

// Create a Spark to repeatedly cast Fire.blast.
const mySpark = new Spark({
  mana: Self.mana
});

// Iterativly cast Fire.blast.
let dist = 1;
while (true) {
  mySpark.setOffset({
    x: dist++ * dx * 0.75
  });
  wait(300);
  mySpark.cast(Fire.blast, {
    angle: Self.facingRight ? 0 : Math.PI
  });
}
