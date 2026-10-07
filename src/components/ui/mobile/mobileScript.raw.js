const controls = require("playerControls");
const fire = require("fire");
const wait = require("wait");

// Perform some movements.
controls.moveHorizontally(1);
controls.jump();
wait(500);
controls.moveHorizontally(0);
wait(500);
controls.moveHorizontally(-1);
wait(500);
controls.moveHorizontally(1);
controls.moveHorizontally(0);
wait(500);

// Cast a fireball.
fire({});

// Cast some more fireballs.
function spiral() {
  for (let i = 0; i < 64; i++) {
    const theta = i * Math.PI * 2 / 16;
    fire({
      velocity: {
        x: 15 * Math.cos(theta),
        y: 15 * Math.sin(theta)
      }
    });
    wait(100);
  }
}
wait(2000);
spiral();