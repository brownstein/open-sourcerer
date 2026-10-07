const Projectile = require("projectile");
const Vector = require("vector");
const Self = require("self");

const proj = new Projectile({
  gravity: 0,
  velocity: Vector()
});

let theta = Self.facingRight ? 0 : Math.PI;
let thetaIncrement = Math.PI * 0.125 * (Self.facingRight ? 1 : -1);

while (!proj.destroyed) {
  theta -= thetaIncrement;
  for (let i = 0; i < 8; i++) {
    const nextPos = new Vector(1).rotate(theta).add(proj.position).round(0.5);
    if (proj.canMoveTo(nextPos)) {
      proj.moveTo(nextPos);
      break;
    }
    theta += thetaIncrement;
  }
}