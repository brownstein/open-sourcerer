import EventEmitter from "events";
import { ProtoSprite } from "protosprite-core";
import {
  ProtoSpriteThree,
  ProtoSpriteThreeEventTypes
} from "protosprite-three";

// This is a utility to listen for specific animation frames for custom event triggers
// on sprites.
export class ProtoSpriteFrameListener<TAnimation extends string = string> {
  public readonly events = new EventEmitter();

  private frameCallbacks = new Map<number, string>();
  private referenceSprite?: ProtoSprite;

  public addFrameCallback(
    animationName: TAnimation | null,
    frameIndex: number,
    eventName: string
  ) {
    if (this.referenceSprite === undefined)
      throw new Error(
        "Please add at least one sprite before adding callbacks."
      );
    let actualFrame = 0;
    if (animationName === null) {
      actualFrame = frameIndex;
    } else {
      const animation =
        this.referenceSprite.maps.animationMap.get(animationName);
      if (!animation)
        throw new Error(
          `Animation ${animationName} not found on the ProtoSprite instance.`
        );
      actualFrame = animation.indexStart + frameIndex;
    }
    this.frameCallbacks.set(actualFrame, eventName);
  }
  private onFrameSwap = (
    details: ProtoSpriteThreeEventTypes["animationFrameSwapped"]
  ) => {
    const { from, to, animation } = details;
    if (from < to) {
      for (let i = from; i <= to; i++) {
        const callbackName = this.frameCallbacks.get(i);
        if (callbackName !== undefined) {
          this.events.emit(callbackName);
        }
      }
    } else {
      let wrapFrom = 0;
      let wrapTo = this.referenceSprite?.data.frames.length ?? 0;
      if (animation !== null) {
        const animationData =
          this.referenceSprite?.maps.animationMap.get(animation);
        if (animationData !== undefined) {
          wrapFrom = animationData.indexStart;
          wrapTo = animationData.indexEnd;
        }
      }
      for (let i = from; i <= wrapTo; i++) {
        const callbackName = this.frameCallbacks.get(i);
        if (callbackName !== undefined) {
          this.events.emit(callbackName);
        }
      }
      for (let i = wrapFrom; i <= to; i++) {
        const callbackName = this.frameCallbacks.get(i);
        if (callbackName !== undefined) {
          this.events.emit(callbackName);
        }
      }
    }
  };
  public subscribe(sprite: ProtoSpriteThree<string, TAnimation>) {
    this.referenceSprite = sprite.data.sprite;
    sprite.events.on("animationFrameSwapped", this.onFrameSwap);
  }
  public unsubscribe(sprite: ProtoSpriteThree<string, TAnimation>) {
    sprite.events.off("animationFrameSwapped", this.onFrameSwap);
  }
}
