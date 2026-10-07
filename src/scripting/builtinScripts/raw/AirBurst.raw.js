/**
 * Behavior: Causes the player to leap into the air.
 * Can be used to double-jump.
 */

// Pull in module dependencies.
const Air = require("air");
const Self = require("self");

// Apply a vertical impulse to the Player.
Air.burst({ y: 10 }, Self.id);
