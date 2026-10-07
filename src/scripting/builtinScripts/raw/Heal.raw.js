const Player = require("self");
const Heal = require("heal");

Heal.instant({
  strength: Math.min(
    (50 - Player.health) * 5,
    Player.mana
  )
});