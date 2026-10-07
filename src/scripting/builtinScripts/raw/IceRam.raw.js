const Ice = require("ice");
const Vector = require("vector");
const Air = require("air");
const Self = require("self");
const wait = require("wait");
const {
  circle
} = require("shapes");
const Aim = require("aim");

const angle = Self.facingRight ? 0 : Math.PI;
const spike = new Ice({
  shape: circle(0.7).map((vtx, i) => {
    return vtx.scale(1 - Math.abs(Math.cos(i * Math.PI / 2.25) * 0.8));
  }),
  angle,
  offset: new Vector(2, -0.2).rotate(angle)
});

Aim.onClick((click) => {
  const delta = click.clone().sub(spike.position).normalize();
  Air.burst(delta.scale(4, 4), spike.id);
});
