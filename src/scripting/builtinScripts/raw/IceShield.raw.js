const Ice = require("ice");
const Shapes = require("shapes");
const Vector = require("vector");
const wait = require("wait");

const shield = new Ice({
  shape: Shapes.rect(0.25, 2),
  offset: new Vector(1, -0.5)
});
wait(2000);
shield.destroy();
