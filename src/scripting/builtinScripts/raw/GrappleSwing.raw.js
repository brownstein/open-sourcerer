var grapple = require("grapple");
var aim = require("aim");
var wait = require("wait");
var self = require("self");

var target = aim.world();
var selfPos = self.position;
var dx = target.x - selfPos.x;
var dy = target.y - selfPos.y;

var hit = grapple.castRay({
  directionX: dx,
  directionY: dy,
  maxDistance: 20
});

if (!hit.hit) {
  console.log("Aim at a wall or ceiling within range to swing from.");
} else {
  var ropeLength = Math.max(hit.distance, 0.5);

  var line = new grapple({
    targetX: hit.x,
    targetY: hit.y,
    length: ropeLength,
    springiness: 1
  });

  while (true) {
    wait(1000);
  }
}
