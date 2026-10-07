/**
 * Behavior: Casts a ring of Earth around the player to shield
 * them from incoming damage.
 */

// Pull in module dependencies.
const Earth = require("earth");
const Shapes = require("shapes");
const wait = require("wait");

// Create the shield.
const shield = new Earth({
  shape: Shapes.circle(1.8),
  holes: [Shapes.circle(1.6)],
  offset: {
    x: 0,
    y: 0
  }
});

// Wait for one second, and then dispose of the shield.
wait(1000);
shield.destroy();
