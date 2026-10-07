/**
 * Behavior: Jumps the player backwards.
 */

// Pull in module dependencies.
const Air = require("air");
const Self = require("self");

// Define a physical impulse to apply to the Player.
const impulse = {
  x: Self.facingRight ? -15 : 15,
  y: 5
};

// Apply the impulse.
Air.burst(impulse, Self.id);
