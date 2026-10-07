var grapple = require("grapple");
var aim = require("aim");
var wait = require("wait");
var self = require("self");

// Aim at a surface to grapple to
var target = aim.world();
var selfPos = self.position;
var dx = target.x - selfPos.x;
var dy = target.y - selfPos.y;

// Cast a ray to find the actual surface hit point
var hit = grapple.castRay({
  directionX: dx,
  directionY: dy,
  maxDistance: 20
});

if (hit.hit) {
  // Create grapple line to the hit point
  var line = new grapple({
    targetX: hit.x,
    targetY: hit.y,
    length: hit.distance,
    springiness: 0.8
  });

  // Brief pause before pulling
  wait(200);

  // Reel in — shrink the rope to pull the player toward the surface
  var pullLength = Math.max(hit.distance * 0.05, 0.3);
  line.setLength(pullLength, 1500);

  while (true) {
    wait(1000);
  }
} else {
  console.log("No surface in range");
}
