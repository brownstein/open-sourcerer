// Homing Duo — spawns two projectiles that lock onto the nearest
// enemy and home in with a subtle sinusoidal wobble.

// Pull in spell module dependencies.
// - sensor: area detection to find nearby entities
// - projectile: creates projectile entities with configurable physics
// - spark: an intermediary caster that lets us launch both
//   projectiles concurrently (so the first doesn't fall idle
//   while the second is being cast)
// - wait: pause spell execution without blocking the game loop
// - speed: controls how fast the spell interpreter runs
var Sensor = require("sensor");
var Projectile = require("projectile");
var Spark = require("spark");
var wait = require("wait");
var setSpeed = require("speed");

// Increase interpreter execution speed so the homing loop
// updates projectile velocities quickly enough to feel smooth.
setSpeed(10);

// Deploy a sensor centered on the caster. The radius of 8 units
// covers a wide area to detect enemies. We wait 200ms to give
// the sensor a physics tick to register overlapping entities.
var sensor = new Sensor({ radius: 8 });
wait(200);

// Iterate through all entities the sensor detected and pick the
// closest one that has the enemy alignment flag set.
var enemies = sensor.extra.nearbyEntities;
var nearest = null;
var nearestDist = Infinity;
for (var i = 0; i < enemies.length; i++) {
  var e = enemies[i];

  // Skip non-enemy entities (e.g. the player, terrain, items).
  if (!e.isEnemy) continue;

  // Compute Euclidean distance from the sensor's position.
  var dx = e.position.x - sensor.position.x;
  var dy = e.position.y - sensor.position.y;
  var dist = Math.sqrt(dx * dx + dy * dy);

  // Track the closest enemy found so far.
  if (dist < nearestDist) {
    nearestDist = dist;
    nearest = e;
  }
}

if (!nearest) {
  // No enemies in range — nothing to shoot at.
  console.log("No enemies detected!");
} else {
  console.log("Target: " + nearest.type);

  // Wrap the casting and homing logic in an async function so we
  // can use await with Promise.all and wait.async.
  async function castAndHome() {
    // Create a Spark with exactly enough mana for two projectiles
    // (10 mana each = 20 total). The Spark acts as a proxy caster,
    // letting us fire both projectiles via castAsync without the
    // player's cast animation blocking between shots.
    var spark = new Spark({ mana: 20 });

    // Launch both projectiles concurrently through the Spark.
    // castAsync returns a promise that resolves once the projectile
    // entity is created — Promise.all waits for both to finish.
    // The two projectiles have slightly different initial velocities
    // (one angled left, one right) so they spread apart briefly.
    // gravity: 0 keeps them floating so the homing loop
    // has full control over their trajectory.
    var results = await Promise.all([
      spark.castAsync(Projectile, {
        velocity: { x: 1, y: 3 },
        strength: 10,
        gravity: 0
      }),
      spark.castAsync(Projectile, {
        velocity: { x: -1, y: 3 },
        strength: 10,
        gravity: 0
      })
    ]);

    // Unpack the two projectile handles from the results array.
    var p1 = results[0];
    var p2 = results[1];

    // The Spark has served its purpose — destroy it so it doesn't
    // linger in the level consuming resources.
    spark.destroy();

    // Brief pause to let the two projectiles drift apart on their
    // initial velocities before the homing loop takes over.
    await wait.async(250);

    // --- Homing loop ---
    // Each tick we recalculate a velocity vector for each projectile
    // that points toward the enemy's current position, plus a small
    // perpendicular sinusoidal offset for visual flair.

    var speed = 8;        // Base homing speed (units/sec).
    var waveAmp = 0.25;   // Desired positional wobble radius (units).
    var waveFreq1 = 6;    // Oscillation frequency for projectile 1 (Hz).
    var waveFreq2 = 4;    // Oscillation frequency for projectile 2 (Hz).
    var tickMs = 30;      // Milliseconds between velocity updates.

    // Since we control velocity (not position), we need the
    // derivative of the desired sine position offset. For
    // pos(t) = A * sin(ωt), vel(t) = A * ω * cos(ωt).
    // So the velocity amplitude must be A * 2π * freq to
    // produce a positional displacement of amplitude A.
    var velAmp1 = waveAmp * 2 * Math.PI * waveFreq1;
    var velAmp2 = waveAmp * 2 * Math.PI * waveFreq2;

    for (var t = 0; t < 120; t++) {
      // Re-read the target's live position each tick so the
      // projectiles track a moving enemy.
      var tx = nearest.position.x;
      var ty = nearest.position.y;

      // Update each projectile's velocity independently.
      var projs = [p1, p2];
      var freqs = [waveFreq1, waveFreq2];
      // Opposite phases make the two projectiles wobble in
      // mirror directions, giving a DNA-helix look.
      var phases = [0, Math.PI];

      for (var pi = 0; pi < 2; pi++) {
        var p = projs[pi];

        // Skip projectiles that have already hit something.
        if (p.destroyed) continue;

        // Vector from projectile to target.
        var dx = tx - p.position.x;
        var dy = ty - p.position.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // If very close to the target, stop steering and let
        // the existing velocity carry it into the collision.
        if (dist < 0.3) continue;

        // Unit vector pointing directly at the target.
        var ux = dx / dist;
        var uy = dy / dist;

        // Perpendicular unit vector (rotated 90 degrees) used
        // as the axis for the sinusoidal wobble.
        var perpX = -uy;
        var perpY = ux;

        // Compute the velocity-space sine wobble for this tick.
        // We use cos (the derivative of sin) so that the resulting
        // positional offset traces a sine wave with amplitude
        // waveAmp (0.25 units). The velocity amplitude is pre-
        // scaled by 2π*freq to account for the integration from
        // velocity to position.
        var velAmps = [velAmp1, velAmp2];
        var wave = Math.cos(t * tickMs / 1000 * freqs[pi] * Math.PI * 2
          + phases[pi]) * velAmps[pi];

        // Final velocity = homing direction * speed + perpendicular * wobble.
        var vx = ux * speed + perpX * wave;
        var vy = uy * speed + perpY * wave;

        // Apply the new velocity to the projectile entity.
        p.setVelocity({ x: vx, y: vy });
      }

      // If both projectiles have been destroyed (hit the enemy
      // or something else), stop the loop early.
      if (p1.destroyed && p2.destroyed) break;

      // Wait one tick before the next velocity update.
      await wait.async(tickMs);
    }
  }

  // Kick off the async casting and homing sequence.
  castAndHome();
}
