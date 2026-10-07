import { Object3D } from "three";

import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import { kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import { Text } from "../Text";

export type ParenthesisBloomProps = EntityProps;

export class ParenthesisBloom extends CoreEntity {
  static type = "ParenthesisBloom";
  public type = ParenthesisBloom.type;

  public object3D = new Object3D();
  public children: BaseEntityType[] = [];

  constructor(props: ParenthesisBloomProps) {
    super(props);

    const textFont = "Highbirth";
    const s = kPixelScale * Math.min(this.size.width, this.size.height) * 0.33;
    const redText = new Text({
      position: props.position,
      text: "{  }",
      textFont,
      troika: true,
      textColor: "#ff4444",
      textPixelSize: s * 0.95,
      textAlign: "center",
      opacity: 0.5,
      additiveBlending: true
    });
    const greenText = new Text({
      position: props.position,
      text: "[  ]",
      textFont,
      troika: true,
      textColor: "#44ff44",
      textPixelSize: s,
      textAlign: "center",
      opacity: 0.5,
      additiveBlending: true
    });
    const blueText = new Text({
      position: props.position,
      text: "(  )",
      textFont,
      troika: true,
      textColor: "#1144ff",
      textPixelSize: s * 1.05,
      textAlign: "center",
      opacity: 0.5,
      additiveBlending: true
    });

    this.children.push(redText, greenText, blueText);

    const doTransition = (t: number) => {
      const remaining = (1 - t) ** 2;
      redText.angle = this.angle + remaining * 2 * Math.PI;
      redText.object3D.rotation.z = redText.angle;
      greenText.angle = -remaining * 2 * Math.PI;
      greenText.object3D.rotation.z = this.angle + greenText.angle;
      blueText.object3D.scale.x = t * 0.5 + 0.5;
      blueText.object3D.scale.y = t * 0.5 + 0.5;
      blueText.angle = remaining;
      blueText.object3D.rotation.z = this.angle + blueText.angle;
      const opacity = Math.max(0, Math.min(1, t * 3));
      redText.opacity = opacity;
      greenText.opacity = opacity;
      blueText.opacity = opacity;
    };

    doTransition(0);

    this.scheduler.add({
      duration: 5000,
      invokeFunction: doTransition,
      invokeFunctionAtComplete: () => {
        this.scheduler.add({
          duration: 1000,
          invokeFunction: (t) => {
            const remaining = 1 - t;
            redText.opacity = remaining;
            greenText.opacity = remaining;
            blueText.opacity = remaining;
          }
        });
      }
    });
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    for (const child of this.children) level.addEntity(child);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    for (const child of this.children) {
      level.removeEntity(child.id);
      child.destroy?.();
    }
    super.detachFromLevel(level);
  }
}
