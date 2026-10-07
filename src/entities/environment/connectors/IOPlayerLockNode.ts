import { Object3D } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { getPlayer } from "src/engine/util/levelUtil";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";
import { SignalProcessorBehavior } from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";

const INPUT_NAME = "input";

/**
 * Built-in player lock: a truthy input takes the player's controls away, a
 * falsy one gives them back. The hand-off a signal-built cutscene needs before
 * it moves the camera or drives an actor. The lock is always released when the
 * node leaves the level, so a half-wired sequence can't strand a save with an
 * unmovable player.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOPlayerLockNode extends CoreEntity {
  static type = "IOPlayerLockNode";
  public type = IOPlayerLockNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private locked = false;

  constructor(props: EntityProps) {
    super(props);

    if (!this.size.width || !this.size.height) {
      this.size = { width: 1, height: 1 };
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors = {
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      processor: new SignalProcessorBehavior({
        requireAllInputs: false,
        frameColor: "#f43f5e",
        displayText: () => ({ lines: [this.locked ? "locked" : "unlocked"] }),
        process: (inputs) => {
          this.setLocked(!!inputs.get(INPUT_NAME));
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);
  }

  detachFromLevel(level: EntityLevelAPI) {
    this.releaseLock(level);
    super.detachFromLevel(level);
  }

  destroy() {
    if (this.level) this.releaseLock(this.level);
    super.destroy();
  }

  private setLocked(locked: boolean) {
    if (!this.level) return;
    getPlayer(this.level)?.setMovementEnabled(!locked);
    this.locked = locked;
  }

  private releaseLock(level: EntityLevelAPI) {
    if (!this.locked) return;
    getPlayer(level)?.setMovementEnabled(true);
    this.locked = false;
  }
}
