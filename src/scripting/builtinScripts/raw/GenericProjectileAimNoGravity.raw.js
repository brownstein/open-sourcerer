// Import the "projectile" library.
const Projectile = require("projectile");

// Cast an aimed projectile that flies straight, unaffected by gravity.
new Projectile({ aim: true, gravity: 0 });
