const Ice = require("ice");
const Vector = require("vector");
const Air = require("air");
const Self = require("self");
const Shapes = require("shapes");
const wait = require("wait");

const spike = new Ice({
  shape: Shapes.circle(2),
  holes: [
    Shapes.circle(1.75)
  ],
  offset: new Vector(0.5, 0.25)
});

wait(2000);

Air.burst(
  new Vector(25 * Self.facingRight ? 1 : -1, 0),
  spike.id
);
