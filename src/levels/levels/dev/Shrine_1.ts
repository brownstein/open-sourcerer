import { Conversation } from "src/api/conversation";
import { EntityLevelEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Adana } from "src/entities/npcs/adana/Adana";
import { Player } from "src/entities/player/Player";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import undergroundPlatformsAdana from "src/levels/tiled/backgrounds/underground-platforms-adana.png";
import adanasChamberFlattened from "src/levels/tiled/maps/shrines/adanas-chamber-flattened.png";
import { selectPlayerName } from "src/redux/status/selectors";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";
import type { RootState } from "src/redux/store";
import { selectCurrentTutorialId } from "src/redux/ui/selectors";
import { startTutorial } from "src/redux/ui/slice";

import shrine_1Screenshot from "./shrine_1.png";

export const Shrine_1: LevelDefinitionAPI = {
  id: "shrine_1",
  screenshotImage: shrine_1Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/shrine_1.tmj")).default,
  images: {
    "adanas-chamber-flattened": adanasChamberFlattened,
    "underground-platforms-adana": undergroundPlatformsAdana
  },
  setup: (level) => {
    // Get the player and Adana entities
    let player: Player | undefined;
    let adana: Adana | undefined;
    let interactionPrompt: KeyboardKeyPrompt | undefined;
    let conversationStarted = false;

    for (const entity of level.getEntities().values()) {
      if (entity.type === Player.type) {
        player = entity as Player;
      } else if (entity.type === Adana.type) {
        adana = entity as Adana;
      }
    }

    if (!player || !adana) return;

    // Enable Adana and set up conversation provider
    adana.enable();
    adana.setConversationProvider((): Conversation<string, string> | null => {
      console.log("[Shrine1] Conversation provider called");

      // Part II: Variables and Data Types
      const varsDialogueReady = level.state.getValue("VarsDialogueReady");
      const varsDialogueDone = level.state.getValue("VarsDialogueDone");
      console.log(
        "[Shrine1] Conversation provider check - VarsDialogueReady:",
        varsDialogueReady,
        "VarsDialogueDone:",
        varsDialogueDone
      );
      if (varsDialogueReady && !varsDialogueDone) {
        console.log("[Shrine1] Returning Part II dialogue");
        return {
          start: "vars_intro1",
          steps: {
            vars_intro1: {
              speaker: "Adana",
              text: () =>
                "Adana: Excellent work with the console. Now, to cast fireballs, you must understand variables. A variable is a named container that stores a value your spell can read and modify.",
              next: "vars_intro2"
            },
            vars_intro2: {
              speaker: "Adana",
              text: () =>
                "Adana: Consider a fireball spell: it needs a damage value, a radius of effect, perhaps a burn duration, and an element type. Each of these is stored in a variable.",
              next: "vars_intro3"
            },
            vars_intro3: {
              speaker: "Adana",
              text: () =>
                'Adana: You declare variables with `let` or `const`. Use `let` for values that change during execution (like a damage multiplier that increases). Use `const` for values that should remain fixed (like the spell name "fireball").',
              next: "vars_q1"
            },
            vars_q1: {
              speaker: "Adana",
              text: () =>
                "Adana: In a fireball spell that tracks how many times it has bounced off walls, which declaration allows the bounce count to increment?",
              nextOptions: [
                {
                  text: () => "A) const bounceCount = 0;",
                  next: "vars_q1_wrong_const"
                },
                {
                  text: () => "B) let bounceCount = 0;",
                  next: "vars_q1_right"
                },
                {
                  text: () => "C) const bounceCount = bounceCount + 1;",
                  next: "vars_q1_wrong_syntax"
                },
                {
                  text: () => "D) let bounceCount;",
                  next: "vars_q1_wrong_uninitialized"
                }
              ]
            },
            vars_q1_wrong_const: {
              speaker: "Adana",
              text: () =>
                "Adana: `const` creates an immutable binding. Once set, it cannot be reassigned. A counter must change, so `const` is incorrect here.",
              next: "vars_q1"
            },
            vars_q1_wrong_syntax: {
              speaker: "Adana",
              text: () =>
                "Adana: This tries to use `bounceCount` before it's declared, and `const` prevents reassignment anyway. You need `let` with an initial value.",
              next: "vars_q1"
            },
            vars_q1_wrong_uninitialized: {
              speaker: "Adana",
              text: () =>
                "Adana: While `let` is correct for a changeable value, this leaves `bounceCount` as `undefined`. Initialize it with `let bounceCount = 0;` so it starts at a known value.",
              next: "vars_q1"
            },
            vars_q1_right: {
              speaker: "Adana",
              text: () =>
                "Adana: Precisely. `let` allows reassignment, and initializing to 0 gives you a valid starting point. Later you can write `bounceCount = bounceCount + 1;` to increment it.",
              next: "vars_q2"
            },
            vars_q2: {
              speaker: "Adana",
              text: () =>
                "Adana: Which variable name best communicates that it holds the blast radius (in meters) of a fireball? Consider readability and maintainability.",
              nextOptions: [
                {
                  text: () => "A) r",
                  next: "vars_q2_wrong_short"
                },
                {
                  text: () => "B) radius",
                  next: "vars_q2_partial"
                },
                {
                  text: () => "C) fireballBlastRadius",
                  next: "vars_q2_right"
                },
                {
                  text: () => "D) fbr",
                  next: "vars_q2_wrong_abbrev"
                }
              ]
            },
            vars_q2_wrong_short: {
              speaker: "Adana",
              text: () =>
                "Adana: Single-letter names are cryptic. In a complex spell with multiple values, you'll forget what `r` means. Descriptive names are worth the extra keystrokes.",
              next: "vars_q2"
            },
            vars_q2_partial: {
              speaker: "Adana",
              text: () =>
                'Adana: "radius" is better than `r`, but ambiguous. Is it the explosion radius, the casting range, or something else? More specificity helps: `fireballBlastRadius` or `explosionRadius` are clearer.',
              next: "vars_q2"
            },
            vars_q2_wrong_abbrev: {
              speaker: "Adana",
              text: () =>
                "Adana: Abbreviations like `fbr` save typing but sacrifice clarity. Future you (or another caster) will need to decode the abbreviation. Prefer explicit names.",
              next: "vars_q2"
            },
            vars_q2_right: {
              speaker: "Adana",
              text: () =>
                "Adana: Excellent. `fireballBlastRadius` immediately tells you: this is for a fireball, it's the blast (explosion) radius, and it's a radius value. Self-documenting code is maintainable code.",
              next: "types_intro1"
            },
            types_intro1: {
              speaker: "Adana",
              text: () =>
                'Adana: Variables store values of specific "data types" — JavaScript classifies values by what they represent and how they behave. Three fundamental types you\'ll use: number, string, and boolean.',
              next: "types_intro2"
            },
            types_intro2: {
              speaker: "Adana",
              text: () =>
                'Adana: A **number** represents numeric values: integers like `50` (damage points) or decimals like `3.5` (radius in meters). A **string** is text wrapped in quotes: `"fire"` (element type) or `"fireball"` (spell name). A **boolean** is either `true` or `false` — perfect for flags like `isEmpowered` or `hasBurned`.',
              next: "types_intro3"
            },
            types_intro3: {
              speaker: "Adana",
              text: () =>
                'Adana: Type matters. You cannot add a string to a number directly — `50 + "fire"` becomes `"50fire"` (concatenation), not `53`. Understanding types prevents subtle bugs.',
              next: "types_q1"
            },
            types_q1: {
              speaker: "Adana",
              text: () =>
                "Adana: Your fireball spell needs to store its element type. Which of these correctly represents the element as a string?",
              nextOptions: [
                {
                  text: () => "A) element = fire;",
                  next: "types_q1_wrong_no_quotes"
                },
                {
                  text: () => 'B) element = "fire";',
                  next: "types_q1_right"
                },
                {
                  text: () => "C) element = 25;",
                  next: "types_q1_wrong_number"
                },
                {
                  text: () => "D) element = 'fire';",
                  next: "types_q1_also_right"
                }
              ]
            },
            types_q1_wrong_no_quotes: {
              speaker: "Adana",
              text: () =>
                "Adana: Without quotes, JavaScript treats `fire` as an identifier (a variable name), not text. It will look for a variable named `fire`, which likely doesn't exist. Strings require quotes: `\"fire\"` or `'fire'`.",
              next: "types_q1"
            },
            types_q1_wrong_number: {
              speaker: "Adana",
              text: () =>
                'Adana: `25` is a number type. While you could encode elements as numbers (e.g., `1 = fire, 2 = ice`), that\'s less readable. Use a string like `"fire"` for clarity.',
              next: "types_q1"
            },
            types_q1_also_right: {
              speaker: "Adana",
              text: () =>
                "Adana: Actually, this also works! JavaScript allows both double quotes `\"fire\"` and single quotes `'fire'` for strings. They're equivalent — choose based on style or to avoid escaping quotes inside.",
              next: "types_q1_right_cont"
            },
            types_q1_right: {
              speaker: "Adana",
              text: () =>
                'Adana: Correct. The quotes create a string literal. The value `"fire"` is text data, distinct from a number or boolean.',
              next: "types_q2"
            },
            types_q1_right_cont: {
              speaker: "Adana",
              text: () =>
                "Adana: Both single and double quotes work for strings. The important part is that quotes are present, making it a string type rather than a number or identifier.",
              next: "types_q2"
            },
            types_q2: {
              speaker: "Adana",
              text: () =>
                "Adana: Your fireball can be 'empowered' to deal extra damage. Which variable declaration correctly represents this as a boolean flag?",
              nextOptions: [
                {
                  text: () => "A) let isEmpowered = true;",
                  next: "types_q2_right"
                },
                {
                  text: () => "B) let empoweredDamage = 50;",
                  next: "types_q2_wrong_number"
                },
                {
                  text: () => 'C) let isEmpowered = "yes";',
                  next: "types_q2_wrong_string"
                },
                {
                  text: () => "D) let isEmpowered = 1;",
                  next: "types_q2_wrong_numeric_boolean"
                }
              ]
            },
            types_q2_wrong_number: {
              speaker: "Adana",
              text: () =>
                "Adana: This stores a damage value (50), not a flag. While you could use numbers (0 = false, 1 = true), booleans (`true`/`false`) are the semantic choice for yes/no states. They make code more readable: `if (isEmpowered)` is clearer than `if (empoweredDamage > 0)`.",
              next: "types_q2"
            },
            types_q2_wrong_string: {
              speaker: "Adana",
              text: () =>
                '"yes" is a string, not a boolean. While it might work in conditions (`if (isEmpowered === "yes")`), booleans are the proper type. Use `true` or `false` for boolean logic.',
              next: "types_q2"
            },
            types_q2_wrong_numeric_boolean: {
              speaker: "Adana",
              text: () =>
                'Adana: In some languages, `1` represents true, but in JavaScript, `1` is a number, not a boolean. While `if (isEmpowered)` works with `1` (because 1 is "truthy"), the type is wrong. Use `true` for clarity and type correctness.',
              next: "types_q2"
            },
            types_q2_right: {
              speaker: "Adana",
              text: () =>
                "Adana: Perfect. `isEmpowered = true` creates a boolean variable. This type exists specifically for yes/no, on/off, enabled/disabled states. It makes your code's intent unambiguous.",
              next: "types_q3"
            },
            types_q3: {
              speaker: "Adana",
              text: () =>
                "Adana: A fireball's damage might be calculated as `baseDamage * multiplier`. If `baseDamage = 50` (number) and `multiplier = 1.5` (number), what type will the result be?",
              nextOptions: [
                {
                  text: () =>
                    "A) number — math operations on numbers produce numbers",
                  next: "types_q3_right"
                },
                {
                  text: () =>
                    "B) string — JavaScript converts numbers to text when multiplying",
                  next: "types_q3_wrong"
                },
                {
                  text: () => "C) boolean — the result is either true or false",
                  next: "types_q3_wrong2"
                },
                {
                  text: () =>
                    "D) undefined — multiplication doesn't return a value",
                  next: "types_q3_wrong3"
                }
              ]
            },
            types_q3_wrong: {
              speaker: "Adana",
              text: () =>
                "Adana: No. When you multiply two numbers (`50 * 1.5`), JavaScript performs numeric multiplication, producing a number (`75`). Strings are only involved if you concatenate with `+` when one operand is a string.",
              next: "types_q3"
            },
            types_q3_wrong2: {
              speaker: "Adana",
              text: () =>
                "Adana: Booleans (`true`/`false`) are for logical conditions, not arithmetic results. Mathematical operations on numbers produce numbers.",
              next: "types_q3"
            },
            types_q3_wrong3: {
              speaker: "Adana",
              text: () =>
                "Adana: Arithmetic operations always return a value. `50 * 1.5` evaluates to `75`, a number. `undefined` appears when a variable is declared but not assigned, or a function has no return value.",
              next: "types_q3"
            },
            types_q3_right: {
              speaker: "Adana",
              text: () =>
                "Adana: Exactly. Number operations produce numbers. `50 * 1.5 = 75` (a number). Understanding how types interact prevents type-related bugs.",
              next: "vars_types_wrap"
            },
            vars_types_wrap: {
              speaker: "Adana",
              text: () =>
                "Adana: You now understand variables (`let` for changeable values, `const` for constants), naming (clear and descriptive), and types (number, string, boolean). These are the building blocks of spell logic.",
              next: "vars_types_wrap2"
            },
            vars_types_wrap2: {
              speaker: "Adana",
              text: () =>
                'Adana: When you cast your fireball, you\'ll declare variables like `let damage = 50;`, `const element = "fire";`, and `let isEmpowered = false;`. The spell reads and modifies these values to control behavior.',
              next: "vars_types_wrap3"
            },
            vars_types_wrap3: {
              speaker: "Adana",
              text: () =>
                "Adana: Practice this foundation. Soon, you'll write code that reads these variables, makes decisions based on them, and shapes your fireball's behavior. Ready to cast your first spell?",
              done: true
            }
          },
          onComplete: () => {
            level.state.setValue("VarsDialogueDone", true);
            level.state.setValue("VarsDialogueReady", false);
          }
        };
      }

      // Intro conversation shown once
      if (!level.state.getValue("AdanaIntroDone")) {
        return null; // Will use OverlayConversation instead
      }

      return null;
    });

    // Set up the conversation when player approaches Adana
    const startConversation = async () => {
      if (!player || !adana || conversationStarted) return;

      conversationStarted = true;

      // Remove interaction prompt
      if (interactionPrompt) {
        level.removeEntity(interactionPrompt.id);
        interactionPrompt.destroy();
        interactionPrompt = undefined;
      }

      // Disable player controls during conversation
      store.dispatch(setCutsceneLocked(true));

      const convo = new OverlayConversation({
        position: adana.position.clone(),
        conversation: {
          start: "intro1",
          steps: {
            intro1: {
              speaker: "Adana",
              text: () =>
                `Adana: Welcome, ${selectPlayerName(store.getState())}. Before we script power, we must learn to observe. In code, observation begins with the [console](glossary:console).`,
              next: "intro2"
            },
            intro2: {
              speaker: "Adana",
              text: () =>
                "Adana: When you call [console.log()](glossary:console-log), you print values for inspection. Debugging, verifying assumptions, measuring state—this is how engineers see the invisible.",
              next: "intro3"
            },
            intro3: {
              speaker: "Adana",
              text: () =>
                'Adana: There is a tradition: our first message is "Hello World!" Here on Ecma-6, we keep the spirit: "Hello Ecma 6!"',
              next: "intro3a"
            },
            intro3a: {
              speaker: "Adana",
              text: () =>
                "Adana: What is the [console](glossary:console)? It's a panel that shows messages from your code. 'Logging' means sending a message there so you can observe what's happening.",
              next: "intro3b"
            },
            intro3b: {
              speaker: "Adana",
              text: () =>
                'Adana: [console.log()](glossary:console.log()) is a function. In JavaScript "syntax" (the rules for writing code), we write the function name, then parentheses (). Inside the () we put what we want to show—usually a [string](glossary:string) in quotes like "Hello Ecma 6!". The semicolon ; ends the line; a "statement" is a single instruction like this.',
              next: "quiz1_q"
            },

            // Quiz 1
            quiz1_q: {
              speaker: "Adana",
              text: () =>
                "Adana: What does [console.log()](glossary:console-log) actually do?",
              nextOptions: [
                {
                  text: () =>
                    "A) Saves a [string](glossary:string) permanently to disk.",
                  next: "quiz1_wrong_disk"
                },
                {
                  text: () =>
                    "B) Prints a value to the [console](glossary:console) for inspection.",
                  next: "quiz1_correct"
                },
                {
                  text: () => "C) Compiles and optimizes your entire program.",
                  next: "quiz1_wrong_compile"
                }
              ]
            },
            quiz1_wrong_disk: {
              speaker: "Adana",
              text: () =>
                "Adana: Not quite. Printing shows a value now; it does not persist data on disk. Try again.",
              next: "quiz1_q"
            },
            quiz1_wrong_compile: {
              speaker: "Adana",
              text: () =>
                "Adana: No. Compilation and optimization are separate concerns. [console.log()](glossary:console-log) displays output.",
              next: "quiz1_q"
            },
            quiz1_correct: {
              speaker: "Adana",
              text: () =>
                "Adana: Correct. Logging is our window to program state.",
              next: "quiz2_q"
            },

            // Quiz 2
            quiz2_q: {
              speaker: "Adana",
              text: () =>
                "Adana: Which snippet correctly prints Hello Ecma 6!?",
              nextOptions: [
                {
                  text: () => "A) console.log(Hello Ecma 6!);",
                  next: "quiz2_wrong_quotes"
                },
                {
                  text: () => 'B) console.log("Hello Ecma 6!");',
                  next: "quiz2_correct"
                },
                {
                  text: () => 'C) print("Hello Ecma 6!");',
                  next: "quiz2_wrong_print"
                }
              ]
            },
            quiz2_wrong_quotes: {
              speaker: "Adana",
              text: () =>
                "Adana: Close, but strings need quotes. Without quotes, the engine thinks Hello is an identifier. Try again.",
              next: "quiz2_q"
            },
            quiz2_wrong_print: {
              speaker: "Adana",
              text: () =>
                "Adana: print isn't standard JavaScript here. We use [console.log()](glossary:console-log). Try again.",
              next: "quiz2_q"
            },
            quiz2_correct: {
              speaker: "Adana",
              text: () =>
                "Adana: Exactly. Quoted text is a [string](glossary:string).",
              next: "quiz3_q"
            },

            // Quiz 3 (beginner-friendly)
            quiz3_q: {
              speaker: "Adana",
              text: () =>
                "Adana: In [console.log()](glossary:console-log), what are the parentheses () used for?",
              nextOptions: [
                {
                  text: () =>
                    "A) They hold what we want to show — this is called an argument.",
                  next: "quiz3_correct"
                },
                {
                  text: () =>
                    "B) They're just decorations; they don't do anything.",
                  next: "quiz3_wrong_decor"
                },
                {
                  text: () => "C) The semicolon ; goes inside them.",
                  next: "quiz3_wrong_semi"
                }
              ]
            },
            quiz3_wrong_decor: {
              speaker: "Adana",
              text: () =>
                "Adana: Parentheses are part of the syntax of a function call — they carry the information into the function. Try again.",
              next: "quiz3_q"
            },
            quiz3_wrong_semi: {
              speaker: "Adana",
              text: () =>
                "Adana: The semicolon ; ends the statement and goes at the end of the line, not inside the (). Try again.",
              next: "quiz3_q"
            },
            quiz3_correct: {
              speaker: "Adana",
              text: () =>
                'Adana: Exactly. The () carry the value you want to log — for us, the [string](glossary:string) "Hello Ecma 6!".',
              next: "handoff_to_tutorial"
            },

            handoff_to_tutorial: {
              speaker: "Adana",
              text: () =>
                "Adana: Open the [editor](glossary:editor). We'll log our first message to the [console](glossary:console).",
              done: true
            }
          },
          onComplete: () => {
            // Re-enable player controls after conversation
            store.dispatch(setCutsceneLocked(false));
            // Mark intro as done and reset conversation flag
            level.state.setValue("AdanaIntroDone", true);
            conversationStarted = false; // Allow future interactions
          }
        }
      });

      level.addEntity(convo);
      await typedEmitterPromise(convo.conversationEvents, "complete");
    };

    // Set up interaction detection
    let keyListenerAdded = false;
    const handleKeyPress = (event: KeyboardEvent) => {
      console.log("[Shrine1] Key pressed:", event.key);
      if (event.key !== "e" && event.key !== "Enter") return;
      if (!player || !adana) {
        console.log("[Shrine1] Missing player or adana");
        return;
      }

      const distance = player.position.distanceTo(adana.position);
      console.log("[Shrine1] Distance to Adana:", distance);
      if (distance >= 2.0) {
        console.log("[Shrine1] Too far from Adana");
        return;
      }

      const adanaIntroDone = level.state.getValue("AdanaIntroDone");
      const inConversation = level.state.getValue("inConversation");
      const varsDialogueReady = level.state.getValue("VarsDialogueReady");

      console.log("[Shrine1] State check:", {
        adanaIntroDone,
        inConversation,
        conversationStarted,
        varsDialogueReady,
        adanaNearPlayer: !!adana.nearPlayer
      });

      // Block interaction if in conversation or during intro (if not done)
      if (inConversation) {
        console.log("[Shrine1] Blocked: in conversation");
        return;
      }
      if (!adanaIntroDone && conversationStarted) {
        console.log(
          "[Shrine1] Blocked: intro not done and conversation started"
        );
        return;
      }

      if (!adanaIntroDone) {
        console.log("[Shrine1] Starting intro conversation");
        startConversation();
      } else if (adana) {
        console.log("[Shrine1] Attempting Part II interaction");
        // After intro, use Adana's conversation provider (Part II)
        // Ensure nearPlayer is set if we're in range (Adana's collision may not have run yet)
        if (!adana.nearPlayer && player) {
          console.log("[Shrine1] Setting nearPlayer manually");
          adana.nearPlayer = player;
          player.addInteraction(adana.id, adana);
        }
        console.log(
          "[Shrine1] Calling adana.onInteract(), nearPlayer:",
          !!adana.nearPlayer
        );
        adana.onInteract();
      }
    };

    const checkInteraction = () => {
      if (!player || !adana) return;

      const adanaIntroDone = level.state.getValue("AdanaIntroDone");
      const inConversation = level.state.getValue("inConversation");

      // Only block interaction during intro conversation
      if (!adanaIntroDone && conversationStarted) return;

      const distance = player.position.distanceTo(adana.position);
      const varsDialogueReady = level.state.getValue("VarsDialogueReady");

      if (distance < 2.0 && !inConversation) {
        // Player is near Adana, show interaction prompt
        if (!interactionPrompt) {
          const promptPos = adana.position.clone();
          promptPos.y += adana.size.height * 0.5 + 0.75;
          interactionPrompt = new KeyboardKeyPrompt({
            position: promptPos,
            key: "e"
          });
          level.addEntity(interactionPrompt);
          console.log(
            "[Shrine1] Added interaction prompt, adanaIntroDone:",
            adanaIntroDone,
            "varsDialogueReady:",
            varsDialogueReady
          );
        }

        // Add key listener only once
        if (!keyListenerAdded) {
          document.addEventListener("keyup", handleKeyPress);
          keyListenerAdded = true;
          console.log("[Shrine1] Added key listener");
        }
      } else {
        // Player moved away, remove prompt
        if (interactionPrompt) {
          level.removeEntity(interactionPrompt.id);
          interactionPrompt.destroy();
          interactionPrompt = undefined;
        }
        // Remove key listener when player moves away
        if (keyListenerAdded) {
          document.removeEventListener("keyup", handleKeyPress);
          keyListenerAdded = false;
          console.log("[Shrine1] Removed key listener");
        }
      }
    };

    // Check interaction every frame
    level.on(EntityLevelEvents.Step, checkInteraction);

    // Set up tutorial after Adana's conversation completes
    let tutorialSetupAttempted = false;
    const setupTutorialAfterConversation = () => {
      if (tutorialSetupAttempted) return; // Already handled

      const adanaIntroDone = level.state.getValue("AdanaIntroDone");
      const tutorialStarted = level.state.getValue("TutorialStarted");

      if (adanaIntroDone && !tutorialStarted) {
        // store.dispatch(startTutorial(T008ConsoleTutorial.id));
        level.state.setValue("TutorialStarted", true);
        tutorialSetupAttempted = true;
      }
    };

    // Check immediately, then check periodically (not every frame)
    setupTutorialAfterConversation();
    const tutorialCheckInterval = setInterval(() => {
      setupTutorialAfterConversation();
      // Stop checking once tutorial is started
      if (level.state.getValue("TutorialStarted")) {
        clearInterval(tutorialCheckInterval);
      }
    }, 500); // Check every 500ms instead of every frame

    // Cleanup interval if level is destroyed
    level.state.setValue("tutorialCheckInterval", tutorialCheckInterval);

    // Helper to determine if tutorial is active
    const isTutorialActive = (state: RootState): boolean => {
      const tutorialId = selectCurrentTutorialId(state);
      return tutorialId !== undefined;
    };

    // Track previous tutorial active state
    let previousTutorialActive = isTutorialActive(store.getState());

    // Subscribe to Redux store to detect tutorial completion
    // Only check when tutorial state might have changed (throttle to prevent excessive checks)
    let lastCheckTime = 0;
    const CHECK_THROTTLE_MS = 100; // Check at most every 100ms

    const unsubscribe = store.subscribe(() => {
      const now = Date.now();
      if (now - lastCheckTime < CHECK_THROTTLE_MS) return; // Throttle checks
      lastCheckTime = now;

      const currentTutorialActive = isTutorialActive(store.getState());
      const tutorialStarted = level.state.getValue("TutorialStarted");

      // Detect transition from active → inactive
      if (previousTutorialActive && !currentTutorialActive && tutorialStarted) {
        console.log("[Shrine1] Tutorial completed, setting VarsDialogueReady");
        level.state.setValue("VarsDialogueReady", true);
        // Unsubscribe once we've detected completion to prevent further checks
        unsubscribe();
      }

      previousTutorialActive = currentTutorialActive;
    });

    // Store unsubscribe function for cleanup (if level has teardown)
    level.state.setValue("tutorialUnsubscribe", unsubscribe);
  }
};
