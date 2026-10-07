const Earth = require("earth");
const wait = require("wait");

const shape = [];
const hole = [];
const numPoints = 32;

for (let i = 0; i < numPoints; i++) {
  shape.push([
    Math.cos(i * Math.PI * 2 / numPoints) * 2,
    Math.sin(i * Math.PI * 2 / numPoints) * 2,
  ]);
  hole.push([
    Math.cos(i * Math.PI * 2 / numPoints) * 1.8,
    Math.sin(i * Math.PI * 2 / numPoints) * 1.8,
  ]);
}

const earthShield = new Earth({
  shape,
  holes: [hole]
});

wait(2000);

earthShield.destroy();
