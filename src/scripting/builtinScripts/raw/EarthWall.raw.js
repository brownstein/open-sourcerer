const Earth = require("earth");
const self = require("self");
const wait = require("wait");

const facingRight = !!self.extra.facingRight;
const distance = 1; // tiles in front of the caster

new Earth({
  rect: { width: 0.4, height: 1.625 },
  offset: [(facingRight ? 1 : -1) * distance, -0.5]
});

wait(5000);
