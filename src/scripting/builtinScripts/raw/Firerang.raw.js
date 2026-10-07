var Fire = require("fire");
var aim = require("aim");
var self = require("self");
var wait = require("wait");
var Vector = require("vector");

var SPEED = 15;

var target = aim.world();
var delta_pos = new Vector( target.x - self.position.x,
                            target.y - self.position.y);

//Unit vector of a point around the player
var norm_target = delta_pos.normalize();

var fireball = new Fire();
fireball.setVelocity({ x: norm_target.x * SPEED, y: norm_target.y * SPEED });

wait(700);

var return_pos = new Vector(self.position.x - fireball.position.x,
                            self.position.y - fireball.position.y);

fireball.setVelocity({ x: (return_pos.x / return_pos.length()) * SPEED,
                       y: (return_pos.y / return_pos.length()) * SPEED });
