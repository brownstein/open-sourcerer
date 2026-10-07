const Ice = require("ice");
const Vector = require("vector");
const Air = require("air");
const Self = require("self");

const spike = new Ice({
  shape: [
    [0, -0.5],
    [1.5, 0],
    [0, 0.5]
  ],
  offset: new Vector(1, -0.5)
});
Air.burst(
  new Vector(15 * Self.facingRight ? 1 : -1, 0),
  spike.id
);
