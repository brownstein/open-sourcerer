import { Celebration } from "src/api/celebration";
import { createTypedEventEmitter, TypedEventEmitter } from "src/api/util";
import wait from "wait";

type CelebrationControllerEventTypes = {
  "celebrationStarted": Celebration;
  "celebrationFinished": Celebration;
  "allCelebrationsFinished": void;
};

class CelebrationController {
  public events = createTypedEventEmitter<CelebrationControllerEventTypes>();
  private displayQueue: Celebration[] = [];
  private celebrationInProgress = false;
  private celebrationLengthMs = 5000;
  private timeBetweenCelebrationsMs = 1000;

  public get celebrating() {
    return this.displayQueue.length > 0;
  }

  public get currentCelebration() {
    return this.displayQueue.at(0);
  }

  async celebrate(nextCelebration: Celebration) {
    this.displayQueue.push(nextCelebration);
    if (this.celebrationInProgress) return;
    this.celebrationInProgress = true;

    while (this.displayQueue.length > 0) {
      const yay = this.displayQueue.shift();
      if (!yay) break;
      this.events.emit("celebrationStarted", yay);
      await wait(this.celebrationLengthMs);
      this.events.emit("celebrationFinished", yay);
      if (this.displayQueue.length > 0) await wait(this.timeBetweenCelebrationsMs);
    }

    this.events.emit("allCelebrationsFinished");
    this.celebrationInProgress = false;
  }
}

// MC in the house!
// Alternatively,
// Sent birthday invites, and now all your friend is here...
export const celebrationSingleton = new CelebrationController();
