const ping = require("ping");
const Spark = require("spark");
const Projectile = require("projectile");
const Self = require("self");
const Vector = require("vector");
const wait = require("wait");

const entities = ping();
const doors = entities.filter((e) => e.type === "TechDoor");
let fountain;
for (const entity of entities) {
  if (entity.type === "ManaFountain") fountain = entity;
}

const feedSpark = new Spark();
feedSpark.setPosition(fountain.position);
wait(1000);

while (true) {
  feedSpark.leech(fountain.id);
  const attackSpark = feedSpark.cast(Spark, { mana: 50 });
  attackSpark.setPosition(Self.position);
  wait(1000);
  for (const door of doors) {
    if (door.position.x < Self.position.x + 3) door.open();
  }
  attackSpark.setPosition(new Vector(2.5, 0).add(Self.position));
  wait(500);
  for (const door of doors) {
    if (door.position.x < Self.position.x + 3) {
      door.close();
    } else {
      door.open();
    }
  }
  attackSpark.setPosition(new Vector(6, 0).add(Self.position));
  wait(500);
  for (const door of doors) door.close();
  attackSpark.cast(Projectile, { aim: true, strength: 50 });
  wait(200);
  attackSpark.destroy();
}