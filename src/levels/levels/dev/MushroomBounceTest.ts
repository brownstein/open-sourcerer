import { LevelAPI } from "src/api/entity";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BouncyMushroom } from "src/entities/environment/BouncyMushroom";
import { Text } from "src/entities/environment/Text";
import { AncientConsole } from "src/entities/environment/coding/AncientConsole";

export const MushroomBounceTest: LevelDefinitionAPI = {
  id: "MushroomBounceTest",
  mapJson: async () =>
    (await import("src/levels/levels/dev/MushroomBounceTest.tmj")).default,
  setup: (level: LevelAPI) => {
    const mushrooms = level
      .getEntitiesForType(BouncyMushroom)
      .sort((a, b) => a.position.x - b.position.x);

    const ancientConsole = level.getEntitiesForType(AncientConsole).at(0);
    if (ancientConsole) {
      let errorText: Text | undefined;
      ancientConsole.acceptCode = async (code: string) => {
        if (errorText) {
          level.removeEntity(errorText.id);
          errorText.destroy();
          errorText = undefined;
        }
        try {
          // eslint-disable-next-line no-new-func
          const values = new Function(`return (${code})`)();
          if (!Array.isArray(values)) {
            throw new Error("Not an array.");
          }
          if (!values.every((v: unknown) => !isNaN(Number(v)))) {
            throw new Error("All elements must be numbers.");
          }
          if (values.length !== mushrooms.length) {
            throw new Error(
              "Incorrect number of elements provided to array." +
                "\nRequired: " +
                mushrooms.length +
                "\nYou provided:" +
                values.length
            );
          }

          values.forEach((v: number, i: number) => {
            mushrooms[i].setBounciness(0, v);
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("AncientConsole eval error:", e);
          const errorPosition = ancientConsole.position.clone();
          errorPosition.y += 2;
          errorText = new Text({
            text: message,
            position: errorPosition,
            textColor: "#ff4444",
            textWrap: true,
            size: { width: 6, height: 2 },
            textPixelSize: 12
          });
          level.addEntity(errorText);
        }
      };
    }
  }
};

// Test values :

// gibberishj
// "words not arrays"
// ["one","two","three","four"] <- needs fixing.
// [0]
// [0,1,2,3,4,5]
// [0, 0, 0, 0]
// [5, 10, 15, 1]
// [10,15,20,5]
