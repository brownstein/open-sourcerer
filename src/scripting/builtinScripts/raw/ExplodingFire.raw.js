/**
 * Generates an exploding fireball.
 */

// Import dependencies.
const Fire = require("fire");
const fireball = new Fire();
fireball.onImpact(() => fireball.explode());
