const Earth = require("earth");
const Vector = require("vector");
const { rect } = require("shapes");

const offset = Vector(0, -0.6);
const shape = rect(1, 1);

for (let i = 0; i < 10; i++) {
  new Earth({
    offset,
    shape
  });
}