const Earth = require("earth");
const Shapes = require("shapes");
const Vector = require("vector");
const wait = require("wait");
const self = require("self");
const Air = require("air");
const facingRight = !!self.extra.facingRight;

const earthInstance = new Earth({
  shape: Shapes.triangle(0.75).map(
    (vtx) => new Vector(vtx.x, vtx.y * 0.5)
  ),
  angle: Math.PI * 0.15 * (facingRight ? 1 : -1),
  offset: new Vector(facingRight ? 1 : -1, -0.75)
});
earthInstance.detachFromTerrain();
Air.burst(
  new Vector(15 * (facingRight ? 1 : -1), 4),
  earthInstance.id
);
for (let i = 0; i < 30; i++) {
  wait(30);
}
earthInstance.destroy();