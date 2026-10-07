var grapple = require("grapple");
var aim = require("aim");
var wait = require("wait");
var self = require("self");
var getEntities = require("getEntities");

// Finds the entity closest to a clicked point, ignoring anything over a tile away
function nearestEntity(point) {
  var entities = getEntities();
  var closest = null;
  var closestDistance = 1;
  for (var i = 0; i < entities.length; i++) {
    var candidate = entities[i];
    // Only grab entities with a real body, not triggers, markers or the aim cursor
    if (!candidate.solid) continue;
    var dx = candidate.position.x - point.x;
    var dy = candidate.position.y - point.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

// First click chooses what to grapple
var source = nearestEntity(aim.world());
if (!source) {
  console.log("Aim at an entity to grab it.");
} else {
  // Second click chooses where to attach it
  var targetClick = aim.world();
  var target = nearestEntity(targetClick);

  var opts = {
    sourceEntityId: source.id,
    springiness: 0.8
  };

  if (target) {
    // Attaching to an entity makes the line follow it as it moves
    opts.targetX = target.position.x;
    opts.targetY = target.position.y;
    opts.targetEntityId = target.id;
  } else {
    // No entity there, so grab a wall only if one is close by in that direction
    var hit = grapple.castRay({
      directionX: targetClick.x - self.position.x,
      directionY: targetClick.y - self.position.y,
      maxDistance: 20
    });
    if (hit.hit) {
      opts.targetX = hit.x;
      opts.targetY = hit.y;
      if (hit.entityId) {
        opts.targetEntityId = hit.entityId;
      }
    }
  }

  if (opts.targetX === undefined) {
    // Nothing solid at that spot, so there is nothing to anchor onto
    console.log("Aim at an entity or a nearby wall to attach to.");
  } else {
    var line = new grapple(opts);

    // Reel the line in to drag the source over to whatever it grabbed
    wait(200);
    line.setLength(0.3, 1500);

    // Keep running so the grapple stays up until you stop the spell
    while (true) {
      wait(1000);
    }
  }
}
