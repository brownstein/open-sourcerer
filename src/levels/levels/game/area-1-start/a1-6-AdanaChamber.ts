import { Vector3 } from "three";

import { makeConversation } from "src/api/conversation";
import { EntityLevelEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { ItemBook, ItemBookEvents } from "src/entities/items/ItemBook";
import { Adana } from "src/entities/npcs/adana/Adana";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import adanasChamberFlattened from "src/levels/tiled/maps/area1-intro/adanas-chamber-flattened.png";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

export const Area1_6_AdanaChamber: LevelDefinitionAPI = {
  id: "Area1_6_AdanaChamber",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a6-shrine-adana-chamber.tmj")).default,
  images: {
    // "underground-platforms-adana": undergroundPlatformsAdana,
    "adanas-chamber-flattened": adanasChamberFlattened
  },
  setup: (level) => {
    const player = getPlayer(level);
    const bookEntity = level.getEntityForName("Book");
    const marker1 = level.getEntityForName("Marker 1");
    const marker2 = level.getEntityForName("Marker 2");
    const marker3 = level.getEntityForName("Marker 3");

    if (!player || !bookEntity || !marker1 || !marker2 || !marker3) return;
    const book = bookEntity as ItemBook;

    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, scheduler.step.bind(scheduler));

    const doCinematic = async () => {
      const adanaPosition = marker1.position.clone();
      const adana = new Adana({
        position: adanaPosition,
        isCurrentlyABird: true,
        isCurrentlyFlying: true
      });
      adana.setOpacity(0.8, 2000);
      level.addEntity(adana);

      store.dispatch(setCutsceneLocked(true));

      scheduler.add({
        duration: 3000,
        invokeEventAtComplete: "doNext",
        invokeFunction: (t) => {
          adana.position.copy(marker1.position).lerp(marker2.position, t);
          const scale = t + 1;
          adana.object3D.scale.set(scale, scale, scale);
        },
        invokeFunctionAtComplete: () => {
          adana.position.copy(marker2.position);
        }
      });
      await typedEmitterPromise(scheduler, "doNext");
      const deferredPathFollow = player.plotAndFollowPath(
        vector3To2(marker3.position)
      );
      deferredPathFollow.once("done", () => player.faceImmediate(true));

      adana.birdLand();
      scheduler.add({ duration: 2000, invokeEventAtComplete: "doNext" });
      await typedEmitterPromise(scheduler, "doNext");
      adana.becomeAnthro();
      scheduler.add({ duration: 1000, invokeEventAtComplete: "doNext" });
      await typedEmitterPromise(scheduler, "doNext");

      const convoDeferred = new DeferredEmitter();
      const convo = new OverlayConversation({
        position: new Vector3(),
        conversation: makeConversation({
          start: "start",
          steps: {
            start: {
              speaker: "Adana",
              text: () => [
                "Data...corrupted? Or just truncated?...",
                "Would you mind telling me the date, humanoid?"
              ],
              nextOptions: [
                { text: () => ["What?"], next: "playerWhat" },
                { text: () => ["Who are you?"], next: "playerWhoAreYou" },
                {
                  text: () => ["The 9th day of Harvestober, 511"],
                  next: "adanaGetsTheDate"
                }
              ]
            },
            playerWhat: {
              speaker: "Player",
              text: () => [
                "...As in, the year? The time since the Ascendance?"
              ],
              nextOptions: [
                { text: () => ["The what?"], next: "adanaConfused" }
              ]
            },
            adanaConfused: {
              speaker: "Adana",
              text: () => ["Oh dear..."],
              next: "adanaGetsTheDate"
            },
            playerWhoAreYou: {
              speaker: "Adana",
              text: () => [
                "I am Adana, and I am in dire need of today's date."
              ],
              next: "adanaGetsTheDate"
            },
            adanaGetsTheDate: {
              speaker: "Adana",
              text: () => [
                "Ah, thank you...Oh...It's..been quite some time, it seems.",
                "*Adana swipes through a holographic terminal*",
                "Hm. What sector are you from?"
              ],
              next: "playerSector"
            },
            playerSector: {
              speaker: "Player",
              text: () => ["Sector?"],
              next: "adanaCity"
            },
            adanaCity: {
              speaker: "Adana",
              text: () => ["What's your city number, then?"],
              nextOptions: [
                {
                  text: () => [
                    "City? Isn't that what they used to call the ruins?"
                  ],
                  next: "adanaRuins"
                },
                {
                  text: () => ["What are you talking about?"],
                  next: "adanaBygone"
                }
              ]
            },
            adanaRuins: {
              speaker: "Adana",
              text: () => ["Ruins, is it?...I see."],
              next: "adanaDeal"
            },
            adanaBygone: {
              speaker: "Adana",
              text: () => ["A bygone period, it seems..."],
              next: "adanaDeal"
            },
            adanaDeal: {
              speaker: "Adana",
              text: () => [
                "*Adana's eyes glow*",
                "How about a deal? I give you what you need to leave this cave, and you bring this book with you to the surface."
              ],
              nextOptions: [
                { text: () => ["Deal"], next: "adanaGivesAirSpell" },
                { text: () => ["Nah"], next: "adanaDeath" }
              ]
            },
            adanaDeath: {
              speaker: "Adana",
              text: () => ["Oh...well, good luck, then."],
              next: "playerStarves"
            },
            playerStarves: {
              speaker: "Narrator",
              text: () => ["You starve to death in the cave."],
              done: true
            },
            adanaGivesAirSpell: {
              speaker: "Adana",
              text: () => [
                "Here, take this spell to ascend out of the tunnel."
              ],
              next: "adanaForest"
            },
            adanaForest: {
              speaker: "Adana",
              text: () => [
                "*A satellite dish spins on Adana's head*",
                "I suppose the forest is too dense for a signal. Would you mind climbing to the top of a tree?"
              ],
              next: "playerClimbs"
            },
            playerClimbs: {
              speaker: "Narrator",
              text: () => ["You climb to the top of a tree."],
              next: "adanaSilent"
            },
            adanaSilent: {
              speaker: "Adana",
              text: () => ["The sky appears to be silent."],
              next: "playerConfused"
            },
            playerConfused: {
              speaker: "Player",
              text: () => ["...What?-"],
              next: "adanaSuggestion"
            },
            adanaSuggestion: {
              speaker: "Adana",
              text: () => [
                "Say, there's a radio tower way beyond the forest to the East. Do you think you could take me there?"
              ],
              nextOptions: [
                {
                  text: () => [
                    "That's not a small walk, you know? I barely even know you."
                  ],
                  next: "adanaFireball"
                },
                {
                  text: () => [
                    "Nope. Way too dangerous without at least a party of four."
                  ],
                  next: "adanaFireball"
                }
              ]
            },
            adanaFireball: {
              speaker: "Adana",
              text: () => [
                "...I see. In that case, allow me to influence your decision.",
                "*Player obtains the Fireball spell*"
              ],
              next: "playerResponse"
            },
            playerResponse: {
              speaker: "Player",
              text: () => [
                "You think I can be bribed with the ability to throw fire?"
              ],
              nextOptions: [
                { text: () => ["Yes"], next: "adanaYes" },
                {
                  text: () => [
                    "One journey through the forest, coming right up."
                  ],
                  next: "adanaAgreement"
                }
              ]
            },
            adanaYes: {
              speaker: "Adana",
              text: () => ["Yes."],
              next: "playerConcedes"
            },
            playerConcedes: {
              speaker: "Player",
              text: () => ["Well...ah...fine."],
              done: true
            },
            adanaAgreement: {
              speaker: "Adana",
              text: () => ["Excellent. Let's get moving."],
              done: true
            }
          },
          onComplete: () => convoDeferred.emit("done")
        })
      });

      level.addEntity(convo);
      await convoDeferred.getPromise();

      store.dispatch(enableUIElements([EnableElements.Mana]));

      store.dispatch(setCutsceneLocked(false));
    };

    book.itemBookEvents.once(ItemBookEvents.Pickup, doCinematic);
  }
};
