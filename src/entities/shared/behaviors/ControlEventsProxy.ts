import {
  ControlEventEmitter,
  ControlEventTypes,
  ControlEvents,
  ControlsAPI
} from "src/api/controls";
import { BaseEntityType, EntityBehavior, EntityLevelEvents, LevelAPI } from "src/api/entity";
import { EventsProxy } from "src/engine/util/eventsProxy";

export class ControlEventsProxy
  extends EventsProxy<ControlEventTypes>
  implements EntityBehavior
{
  public type = "ControlEventsProxy";
  public listensToPlayerControls = false;
  public disconnectOnDetach = true;

  private level?: LevelAPI;
  private alreadyListeningToPlayerControls = false;
  private subscribedToEmitters: ControlEventEmitter[] = [];

  subscribe(emitter: ControlEventEmitter) {
    if (!this.emitterToSubscriptors.has(emitter))
      this.subscribedToEmitters.push(emitter);
    super.subscribe(emitter, Object.values(ControlEvents));
    return this;
  }
  unsubscrbe(emitter: ControlEventEmitter) {
    this.subscribedToEmitters = this.subscribedToEmitters.filter(
      (em) => em !== emitter
    );
    super.unsubscribe(emitter);
    return this;
  }
  enable(emitter: ControlEventEmitter) {
    super.enableEmitter(emitter);
    return this;
  }
  disable(emitter: ControlEventEmitter) {
    super.disableEmitter(emitter);
    return this;
  }
  private attachPlayerControlsCallback = (
    controls: ControlsAPI<BaseEntityType>
  ) => {
    if (this.alreadyListeningToPlayerControls) return;
    this.alreadyListeningToPlayerControls = true;
    this.subscribe(controls.events);
  };
  listenToPlayerControls() {
    this.listensToPlayerControls = true;
    if (this.level?.controls)
      this.attachPlayerControlsCallback(this.level.controls);
    this.level?.on(
      EntityLevelEvents.AttachControls,
      this.attachPlayerControlsCallback
    );
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    if (this.level.controls)
      this.attachPlayerControlsCallback(this.level.controls);
    this.level.on(
      EntityLevelEvents.AttachControls,
      this.attachPlayerControlsCallback
    );
  }
  detachFromLevel(level: LevelAPI) {
    level.off(
      EntityLevelEvents.AttachControls,
      this.attachPlayerControlsCallback
    );
    this.level = undefined;
    if (this.disconnectOnDetach) {
      this.enabled = false;
      for (const emitter of this.subscribedToEmitters) this.unsubscrbe(emitter);
    }
  }
}
