import { AUTO_SPELL_API_MANIFESTS } from "../modules/autoSpellApiManifests";
import { SpellApiManifests } from "./apiManifest";

// Hand-authored entries for the manual spell modules.
const MANUAL_SPELL_API_MANIFESTS: SpellApiManifests = {
  wait: {
    description: "Pauses spell execution for a given number of milliseconds.",
    export: {
      kind: "function",
      description:
        "Pauses spell execution for ms milliseconds without blocking the game loop.",
      params: [
        {
          name: "ms",
          type: "number",
          description: "Milliseconds to wait"
        }
      ],
      returns: "void",
      properties: {
        async: {
          kind: "function",
          description:
            "Promise-returning variant. Use with await inside async blocks.",
          params: [{ name: "ms", type: "number" }],
          returns: "Promise<void>"
        }
      }
    }
  },

  speed: {
    description: "Controls spell execution speed.",
    export: {
      kind: "function",
      description:
        "Sets the execution speed multiplier (0.001–100). Higher values run the spell faster.",
      params: [
        {
          name: "multiplier",
          type: "number",
          description: "Speed multiplier, clamped to 0.001–100"
        }
      ],
      returns: "void"
    }
  },

  self: {
    description: "A live reference to the spell caster entity.",
    export: {
      kind: "object",
      description:
        "Properties update in real-time to reflect the caster's current state.",
      properties: {
        id: {
          kind: "value",
          valueType: "string",
          description: "Entity ID of the caster"
        },
        type: {
          kind: "value",
          valueType: "string",
          description: "Entity type string (e.g. 'Player')"
        },
        position: {
          kind: "value",
          valueType: "{ x: number, y: number, z: number }",
          description: "World-space position"
        },
        destroyed: {
          kind: "value",
          valueType: "boolean",
          description: "True if the caster has been destroyed"
        },
        extra: {
          kind: "value",
          valueType: "object",
          description: "Extra entity-specific data"
        }
      }
    }
  },

  fire: {
    description:
      "Fire spell API — blasts, waves, and controllable fireballs. `require('fire')` returns the Fireball class itself; static methods `blast` and `wave` are on the class.",
    export: {
      kind: "class",
      description:
        "The Fireball class. Construct with `new fire(opts)` or use static helpers `fire.blast()` / `fire.wave()`.",
      constructorParams: [
        {
          name: "opts",
          type: "{ aim?: boolean, strength?: number, gravity?: boolean, aimGuide?: boolean, velocity?: { x: number, y: number }, aimSpeed?: number, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        aim: {
          kind: "value",
          valueType: "boolean",
          description: "Auto-aim at the nearest enemy"
        },
        strength: {
          kind: "value",
          valueType: "number",
          description: "Fireball power (affects mana cost and damage)"
        },
        gravity: {
          kind: "value",
          valueType: "boolean",
          description: "Has gravity?"
        },
        velocity: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Initial velocity vector"
        },
        aimSpeed: {
          kind: "value",
          valueType: "number",
          description: "Auto-aim tracking speed"
        },
        aimGuide: {
          kind: "value",
          valueType: "boolean",
          description:
            "Show parabolic trajectory preview while aiming (requires aim: true)"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to cast from"
        }
      },
      properties: {
        id: {
          kind: "value",
          valueType: "string",
          description: "Entity ID"
        },
        position: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Current world position"
        },
        destroyed: { kind: "value", valueType: "boolean" },
        setVelocity: {
          kind: "function",
          description: "Sets the fireball's velocity vector.",
          params: [{ name: "v", type: "{ x: number, y: number }" }]
        },
        moveTo: {
          kind: "function",
          description: "Moves the fireball to coordinates (blocking).",
          params: [
            {
              name: "opts",
              type: "{ x: number, y: number, speed?: number }",
              optional: true
            }
          ]
        },
        moveToAsync: {
          kind: "function",
          description: "Async/promise variant of moveTo.",
          params: [
            {
              name: "opts",
              type: "{ x: number, y: number, speed?: number }",
              optional: true
            }
          ]
        },
        explode: {
          kind: "function",
          description: "Detonates the fireball immediately.",
          returns: "void"
        },
        onImpact: {
          kind: "function",
          description:
            "Register a callback to run when the fireball hits something.",
          params: [{ name: "cb", type: "function" }]
        }
      },
      staticProperties: {
        blast: {
          kind: "function",
          description: "Casts a single fire blast from the caster.",
          params: [
            {
              name: "opts",
              type: "{ aim?: boolean, angle?: number, spark?: { id: string } }",
              optional: true
            }
          ],
          returns: "void"
        },
        wave: {
          kind: "function",
          description: "Casts a ground-hugging wave of fire blasts.",
          params: [
            {
              name: "opts",
              type: "{ aim?: boolean, angles?: number[], numBlasts?: number, spacing?: number, delayMs?: number, spark?: { id: string } }",
              optional: true
            }
          ],
          returns: "void"
        },
        Fireball: {
          kind: "class",
          description: "Self-reference to the Fireball class.",
          constructorParams: [],
          properties: {}
        }
      }
    }
  },

  ice: {
    description: "Ice block spell API.",
    export: {
      kind: "class",
      description:
        "Creates a solid ice block. Accepts shape, rect, or circle geometry.",
      constructorParams: [
        {
          name: "opts",
          type: "{ shape?: [number,number][], rect?: { width: number, height: number }, circle?: { radius: number }, angle?: number, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        shape: {
          kind: "value",
          valueType: "[number, number][]",
          description: "Custom polygon vertices"
        },
        rect: {
          kind: "value",
          valueType: "{ width: number, height: number }",
          description: "Rectangular shape"
        },
        circle: {
          kind: "value",
          valueType: "{ radius: number }",
          description: "Circular shape"
        },
        angle: {
          kind: "value",
          valueType: "number",
          description: "Rotation angle in radians"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to cast from"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string", description: "Entity ID" },
        position: {
          kind: "value",
          valueType: "{ x: number, y: number }"
        },
        destroyed: { kind: "value", valueType: "boolean" },
        destroy: {
          kind: "function",
          description: "Removes the ice block from the level.",
          returns: "void"
        }
      }
    }
  },

  earth: {
    description: "Earth block spell API.",
    export: {
      kind: "class",
      description:
        "Creates a solid stone/earth block. Accepts shape, rect, circle, or drawShape geometry.",
      constructorParams: [
        {
          name: "opts",
          type: "{ shape?: [number,number][], rect?: { width: number, height: number }, circle?: { radius: number }, holes?: [number,number][][], angle?: number, offset?: { x: number, y: number }, drawShape?: boolean, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        shape: {
          kind: "value",
          valueType: "[number, number][]",
          description: "Custom polygon vertices"
        },
        rect: {
          kind: "value",
          valueType: "{ width: number, height: number }",
          description: "Rectangular shape"
        },
        circle: {
          kind: "value",
          valueType: "{ radius: number }",
          description: "Circular shape"
        },
        holes: {
          kind: "value",
          valueType: "[number, number][][]",
          description: "Holes to cut into the shape"
        },
        angle: {
          kind: "value",
          valueType: "number",
          description: "Rotation angle in radians"
        },
        offset: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Position offset from caster"
        },
        drawShape: {
          kind: "value",
          valueType: "boolean",
          description: "Enter interactive draw mode for custom shape"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to cast from"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string", description: "Entity ID" },
        position: { kind: "value", valueType: "{ x: number, y: number }" },
        destroyed: { kind: "value", valueType: "boolean" },
        destroy: {
          kind: "function",
          description: "Shatters the earth block.",
          returns: "void"
        },
        detachFromTerrain: {
          kind: "function",
          description: "Detaches the block from terrain so it falls.",
          returns: "void"
        }
      }
    }
  },

  air: {
    description: "Air burst spell — applies impulse to entities.",
    export: {
      kind: "object",
      description: "Applies wind/air-burst impulses to game entities.",
      properties: {
        burst: {
          kind: "function",
          description:
            "Applies an air burst. Without args, launches the caster upward. Returns true on success.",
          params: [
            {
              name: "impulse",
              type: "{ x: number, y: number }",
              optional: true,
              description: "Impulse vector (defaults to upward on caster)"
            },
            {
              name: "targetId",
              type: "string | { entityId?: string, handleId?: string }",
              optional: true,
              description: "Target entity ID (defaults to caster)"
            }
          ],
          returns: "boolean"
        }
      }
    }
  },

  sensor: {
    description: "Area sensor — detects nearby entities.",
    export: {
      kind: "class",
      description:
        "Creates a circular sensor that follows the caster and fires callbacks when entities enter or leave.",
      constructorParams: [
        {
          name: "opts",
          type: "{ radius?: number, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        radius: {
          kind: "value",
          valueType: "number",
          description: "Detection radius in world units"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to attach the sensor to"
        }
      },
      properties: {
        id: {
          kind: "value",
          valueType: "string",
          description: "Entity/handle ID"
        },
        ready: { kind: "value", valueType: "boolean" },
        position: { kind: "value", valueType: "{ x: number, y: number }" },
        destroyed: { kind: "value", valueType: "boolean" },
        onEntityEnter: {
          kind: "function",
          description:
            "Registers a callback invoked when an entity enters the sensor area.",
          params: [
            {
              name: "cb",
              type: "function(entity: { id, type, position, isEnemy, extra })"
            }
          ]
        },
        onEntityLeave: {
          kind: "function",
          description:
            "Registers a callback invoked when an entity leaves the sensor area.",
          params: [{ name: "cb", type: "function(entity: { id })" }]
        }
      }
    }
  },

  aim: {
    description: "Mouse aim targeting — shows crosshair and waits for click.",
    export: {
      kind: "object",
      description:
        "Provides mouse-click targeting. Shows a crosshair and resolves when the player clicks.",
      properties: {
        world: {
          kind: "function",
          description:
            "Waits for a mouse click and returns the world-space { x, y } Vector.",
          returns: "Vector | null"
        },
        relative: {
          kind: "function",
          description:
            "Like world(), but coordinates are relative to the player.",
          returns: "Vector | null"
        },
        asyncRelative: {
          kind: "function",
          description: "Promise-returning variant of relative().",
          returns: "Promise<Vector | null>"
        },
        onClick: {
          kind: "function",
          description: "Registers a callback for every subsequent click.",
          params: [{ name: "cb", type: "function(coords: Vector)" }]
        },
        offClick: {
          kind: "function",
          description: "Removes a previously registered onClick callback.",
          params: [{ name: "cb", type: "function" }]
        }
      }
    }
  },

  shapes: {
    description: "Geometry shape generator for spell modules.",
    export: {
      kind: "object",
      description:
        "Generates vertex arrays compatible with ice, earth, and areaPreview.",
      properties: {
        rect: {
          kind: "function",
          description: "Rectangle centered at origin.",
          params: [
            { name: "width", type: "number" },
            { name: "height", type: "number" }
          ],
          returns: "Vector[]"
        },
        triangle: {
          kind: "function",
          description: "Equilateral triangle.",
          params: [
            { name: "radius", type: "number" },
            { name: "angle", type: "number", optional: true }
          ],
          returns: "Vector[]"
        },
        circle: {
          kind: "function",
          description: "Polygon approximating a circle.",
          params: [
            { name: "radius", type: "number" },
            { name: "segments", type: "number", optional: true }
          ],
          returns: "Vector[]"
        }
      }
    }
  },

  vector: {
    description: "2D vector math.",
    export: {
      kind: "class",
      description: "A 2D vector with chainable math operations.",
      constructorParams: [
        { name: "x", type: "number", optional: true },
        { name: "y", type: "number", optional: true }
      ],
      properties: {
        x: { kind: "value", valueType: "number" },
        y: { kind: "value", valueType: "number" },
        clone: {
          kind: "function",
          description: "Returns a copy of this vector.",
          returns: "Vector"
        },
        add: {
          kind: "function",
          description: "Adds another vector in-place.",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "Vector"
        },
        sub: {
          kind: "function",
          description: "Subtracts another vector in-place.",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "Vector"
        },
        scale: {
          kind: "function",
          params: [{ name: "factor", type: "number" }],
          returns: "Vector"
        },
        rotate: {
          kind: "function",
          description: "Rotates by angle in radians.",
          params: [{ name: "angle", type: "number" }],
          returns: "Vector"
        },
        length: {
          kind: "function",
          description: "Returns the magnitude.",
          returns: "number"
        },
        dot: {
          kind: "function",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "number"
        },
        normalize: {
          kind: "function",
          description: "Scales to unit length in-place.",
          returns: "Vector"
        },
        angle: {
          kind: "function",
          description: "Returns the angle in radians (atan2(y, x)).",
          returns: "number"
        }
      }
    }
  },

  heal: {
    description: "Healing spell — instant and over-time variants.",
    export: {
      kind: "object",
      description: "Provides heal.instant() and heal.overTime() spells.",
      properties: {
        Heal: {
          kind: "class",
          description:
            "The Heal class (self-reference for use with spark.cast).",
          constructorParams: [],
          properties: {},
          staticProperties: {
            instant: {
              kind: "function",
              description: "Instantly heals the target.",
              params: [
                {
                  name: "opts",
                  type: "{ strength?: number, targetId?: string }",
                  optional: true
                }
              ]
            },
            overTime: {
              kind: "function",
              description: "Heals a target over 5 seconds.",
              params: [
                {
                  name: "opts",
                  type: "{ strength?: number, targetId?: string }",
                  optional: true
                }
              ]
            }
          }
        },
        instant: {
          kind: "function",
          description: "Instantly heals the caster or target.",
          params: [
            {
              name: "opts",
              type: "{ strength?: number, targetId?: string }",
              optional: true
            }
          ]
        },
        overTime: {
          kind: "function",
          description: "Heals over 5 seconds.",
          params: [
            {
              name: "opts",
              type: "{ strength?: number, targetId?: string }",
              optional: true
            }
          ]
        }
      }
    }
  },

  projectile: {
    description: "Generic customizable projectile spell.",
    export: {
      kind: "class",
      description:
        "A fully customizable projectile — control color, physics, element type, and more.",
      constructorParams: [
        {
          name: "opts",
          type: "{ velocity?: { x, y }, strength?: number, aim?: boolean, aimSpeed?: number, aimGuide?: boolean, directPath?: boolean, colorInner?: { r,g,b }, colorOuter?: { r,g,b }, radius?: number, gravity?: number, elementalType?: string, damageType?: string, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        velocity: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Initial velocity vector"
        },
        strength: {
          kind: "value",
          valueType: "number",
          description: "Projectile power (affects mana cost and damage)"
        },
        aim: {
          kind: "value",
          valueType: "boolean",
          description: "Auto-aim at nearest enemy"
        },
        aimSpeed: {
          kind: "value",
          valueType: "number",
          description: "Auto-aim tracking speed"
        },
        aimGuide: {
          kind: "value",
          valueType: "boolean",
          description:
            "Show parabolic trajectory preview while aiming (requires aim: true)"
        },
        directPath: {
          kind: "value",
          valueType: "boolean",
          description:
            "Use the direct (short) arc to reach the target; false uses the lofted arc"
        },
        colorInner: {
          kind: "value",
          valueType: "{ r: number, g: number, b: number }",
          description: "Inner glow color"
        },
        colorOuter: {
          kind: "value",
          valueType: "{ r: number, g: number, b: number }",
          description: "Outer glow color"
        },
        radius: {
          kind: "value",
          valueType: "number",
          description: "Projectile collision radius"
        },
        gravity: {
          kind: "value",
          valueType: "number",
          description: "Gravity multiplier (0 = no gravity)"
        },
        elementalType: {
          kind: "value",
          valueType: "string",
          description: "Elemental damage type (e.g. 'fire', 'ice')"
        },
        damageType: {
          kind: "value",
          valueType: "string",
          description: "Damage classification string"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to cast from"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string" },
        position: { kind: "value", valueType: "{ x: number, y: number }" },
        destroyed: { kind: "value", valueType: "boolean" },
        setVelocity: {
          kind: "function",
          params: [{ name: "v", type: "{ x: number, y: number }" }]
        },
        moveTo: {
          kind: "function",
          params: [
            {
              name: "opts",
              type: "{ x: number, y: number, speed?: number }",
              optional: true
            }
          ]
        },
        moveToAsync: {
          kind: "function",
          description: "Async variant of moveTo.",
          params: [
            {
              name: "opts",
              type: "{ x: number, y: number, speed?: number }",
              optional: true
            }
          ]
        }
      },
      staticProperties: {
        Projectile: {
          kind: "class",
          description: "Self-reference to the Projectile class.",
          constructorParams: [],
          properties: {}
        }
      }
    }
  },

  terrain: {
    description: "Terrain grid query API.",
    export: {
      kind: "object",
      description: "Query the navigation terrain grid.",
      properties: {
        queryGrid: {
          kind: "function",
          description:
            "Returns a 2D grid of terrain block values within the given bounds.",
          params: [
            {
              name: "opts",
              type: "{ min: { x: number, y: number }, max: { x: number, y: number }, relative?: boolean }"
            }
          ],
          returns: "{ grid: number[][], resolution: number }"
        }
      }
    }
  },

  getEntities: {
    description: "Returns all entities currently in the level.",
    export: {
      kind: "function",
      description:
        "Returns a snapshot array of all active entities in the level.",
      params: [],
      returns: "{ id: string, type: string, position: { x, y, z } }[]"
    }
  },

  playerInventory: {
    description: "Query and modify the player's inventory and hotkeys.",
    export: {
      kind: "object",
      description:
        "Access equipped weapons, hotkeys, consumables, quest items, and coins.",
      properties: {
        getEquippedWeapon: {
          kind: "function",
          description: "Returns the equipped weapon name.",
          returns: "string | null"
        },
        getHotKeyMap: {
          kind: "function",
          description: "Returns the current hotkey assignment map.",
          returns: "object"
        },
        getHotKeyCurrentRow: {
          kind: "function",
          description: "Returns the active hotkey row index.",
          returns: "number"
        },
        getConsumables: {
          kind: "function",
          description: "Returns the consumables map.",
          returns: "object"
        },
        getQuestItems: {
          kind: "function",
          description: "Returns the quest items map.",
          returns: "object"
        },
        hasSword: {
          kind: "function",
          description: "Returns true if the player has a sword.",
          returns: "boolean"
        },
        getCoins: {
          kind: "function",
          description: "Returns the player's coin count.",
          returns: "number"
        },
        setHotKeyCurrentRow: {
          kind: "function",
          description: "Sets the active hotkey row.",
          params: [{ name: "row", type: "number" }]
        },
        assignHotKey: {
          kind: "function",
          description: "Assigns an item to a hotkey slot.",
          params: [
            { name: "hotKey", type: "string" },
            { name: "assignment", type: "object | null" }
          ]
        },
        activateHotKey: {
          kind: "function",
          description: "Activates the item on the given hotkey.",
          params: [{ name: "hotKey", type: "string" }]
        }
      }
    }
  },

  playerControls: {
    description: "Programmatic player movement and action controls.",
    export: {
      kind: "object",
      description: "Control player jump, movement, parry, and sword swing.",
      properties: {
        jump: {
          kind: "function",
          description: "Makes the caster jump.",
          returns: "void"
        },
        moveHorizontally: {
          kind: "function",
          description:
            "Moves the caster. Pass 1 for right, -1 for left, 0 to stop.",
          params: [
            {
              name: "direction",
              type: "number",
              description: "-1 = left, 0 = stop, 1 = right"
            }
          ],
          returns: "void"
        },
        parry: {
          kind: "function",
          description: "Triggers a parry action.",
          returns: "void"
        },
        swordSwing: {
          kind: "function",
          description: "Triggers a sword swing.",
          returns: "void"
        }
      }
    }
  },

  ping: {
    description: "Shows a debug visual ping at the caster's position.",
    export: {
      kind: "function",
      description:
        "Renders a brief visual indicator at the caster's location. Useful for debugging.",
      params: [],
      returns: "void"
    }
  },

  areaPreview: {
    description: "Displays a colored polygon overlay in the game world.",
    export: {
      kind: "class",
      description:
        "Creates a visible polygon preview — useful for showing spell areas before committing.",
      constructorParams: [
        {
          name: "opts",
          type: "{ polygon: [number,number][], attachToEntityId?: string, color?: { r: number, g: number, b: number } }"
        }
      ],
      constructorOpts: {
        polygon: {
          kind: "value",
          valueType: "[number, number][]",
          description: "Polygon vertices defining the preview shape"
        },
        attachToEntityId: {
          kind: "value",
          valueType: "string",
          description: "Entity ID to follow"
        },
        color: {
          kind: "value",
          valueType: "{ r: number, g: number, b: number }",
          description: "Preview color"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string" },
        recolor: {
          kind: "function",
          description: "Changes the overlay color.",
          params: [
            { name: "r", type: "number" },
            { name: "g", type: "number" },
            { name: "b", type: "number" }
          ]
        },
        destroy: {
          kind: "function",
          description: "Fades away and removes the preview.",
          returns: "void"
        }
      }
    }
  }
};

// Manual entries plus the generated auto-module entries. Auto entries are
// spread last so a generated module wins on key collision. Regenerate the auto
// half with: npm run generate-auto-module-bindings
export const SPELL_API_MANIFESTS: SpellApiManifests = {
  ...MANUAL_SPELL_API_MANIFESTS,
  ...AUTO_SPELL_API_MANIFESTS
};
