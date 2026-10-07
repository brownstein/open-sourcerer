import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useCallback, useContext, useState } from "react";

import { BaseEntityType } from "src/api/entity";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { DeerBot } from "src/entities/enemies/DeerBot";
import { WolfBandit } from "src/entities/enemies/WolfBandit";
import { Bat } from "src/entities/enemies/critters/Bat";
import { Bee } from "src/entities/enemies/critters/Bee";
import { BigSlime } from "src/entities/enemies/critters/BigSlime";
import { PlantShield } from "src/entities/enemies/critters/PlantShield/PlantShield";
import { Slime } from "src/entities/enemies/critters/Slime";
import { WalkerThatShoot } from "src/entities/enemies/critters/WalkerThatShoot";
import { WallCrawler } from "src/entities/enemies/critters/WallCrawler";
import { ForestBot } from "src/entities/enemies/robots/ForestBot";
import { UtilityBot } from "src/entities/enemies/robots/UtilityBot";

import "./EnemySpawner.less";

const enemyTypes = {
  Slime,
  WolfBandit,
  DeerBot,
  Bat,
  Bee,
  BigSlime,
  WallCrawler,
  ForestBot,
  UtilityBot,
  WalkerThatShoot,
  PlantShield
};

export function EnemySpawner() {
  const [selectedEnemy, setSelectedEnemy] =
    useState<keyof typeof enemyTypes>("Slime");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const gameController = useContext(GameControllerContext);
  const level = gameController?.level;

  const handleSpawn = useCallback(() => {
    if (!level) return;

    const spawnMarker = level.getEntityForName("Marker");
    if (!spawnMarker) {
      console.warn("No 'Marker' found in the level!");
      return;
    }

    const spawnFn = enemyTypes[selectedEnemy];
    if (spawnFn) {
      const oldEnemy = level.getEntityForName("spawned-debug-enemy");
      if (oldEnemy) level.removeEntity(oldEnemy.id);

      const enemy = new spawnFn({
        position: spawnMarker.position.clone(),
        name: "spawned-debug-enemy"
      });
      level.addEntity(enemy);
    }
  }, [level, selectedEnemy]);

  return (
    <div className="enemy-spawner">
      <button
        className="dropdown-toggle"
        onClick={() => setDropdownOpen((prev) => !prev)}
      >
        <span>Spawn {selectedEnemy.replace(/([A-Z])/g, " $1").trim()}</span>
        {dropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {dropdownOpen && (
        <ul className="enemy-dropdown">
          {Object.keys(enemyTypes).map((enemy) => (
            <li
              key={enemy}
              className="enemy-option"
              onClick={() => {
                setSelectedEnemy(enemy as keyof typeof enemyTypes);
                setDropdownOpen(false);
              }}
            >
              {enemy.replace(/([A-Z])/g, " $1").trim()}
            </li>
          ))}
        </ul>
      )}

      <button className="spawn-button" onClick={handleSpawn}>
        Spawn {selectedEnemy.replace(/([A-Z])/g, " $1").trim()}
      </button>
    </div>
  );
}
