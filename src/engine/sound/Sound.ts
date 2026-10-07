import {
  Audio,
  AudioListener,
  Object3D,
  PositionalAudio,
  Vector2
} from "three";

import {
  MusicManagerAPI,
  SoundAPI,
  SoundManagerAPI,
  SoundType
} from "src/api/sound";
import { MusicAssets } from "src/assets/allMusicAssets";
import { SoundAssets } from "src/assets/allSoundAssets";

import { getAsset } from "../entity/decorators";
import { createReversedAudioBuffer } from "../util/audioUtil";

class MusicManager implements MusicManagerAPI {
  private readonly musicSlotA: Audio;
  private readonly musicSlotB: Audio;
  private readonly soundManager: SoundManagerAPI;

  private activeSlot: "A" | "B" = "A";
  private hasCrossfadeInProgress = false;
  private currentlyPlayingMusicKey?: keyof MusicAssets;
  private targetVolume = 1;
  private currentMusicGain = 1;

  private currentRampRequestKey = 0;

  constructor(soundManager: SoundManagerAPI) {
    this.soundManager = soundManager;

    const listener = this.soundManager.getListener();

    this.musicSlotA = new Audio(listener);
    this.musicSlotB = new Audio(listener);

    soundManager.routeSoundThroughBus(this.musicSlotA, SoundType.Music);
    soundManager.routeSoundThroughBus(this.musicSlotB, SoundType.Music);

    this.setIsLooping(true);
  }

  play(
    musicKey: keyof MusicAssets,
    musicGain?: number,
    crossfadeMs?: number
  ): void {
    if (musicKey === this.currentlyPlayingMusicKey) return;
    this.currentlyPlayingMusicKey = musicKey;

    const thisPlayRequestKey = ++this.currentRampRequestKey;
    this.hasCrossfadeInProgress = true;

    const musicBuffer = getAsset(musicKey);

    const outgoingSlot = this._getActiveSlot();
    const incomingSlot = this._getInactiveSlot();

    incomingSlot.stop().setBuffer(musicBuffer);

    this.soundManager.rampParam(incomingSlot.gain.gain, 0, 0);
    incomingSlot.play();

    this.currentMusicGain = musicGain ?? 1;
    const resolvedCrossfadeMs = crossfadeMs ?? 500;

    this.soundManager.rampParam(
      incomingSlot.gain.gain,
      this.targetVolume * this.currentMusicGain,
      resolvedCrossfadeMs
    );
    this.soundManager.rampParam(outgoingSlot.gain.gain, 0, resolvedCrossfadeMs);

    setTimeout(() => {
      if (thisPlayRequestKey !== this.currentRampRequestKey) return;

      this.hasCrossfadeInProgress = false;
      outgoingSlot.stop();
      this._swapActiveSlot();
    }, resolvedCrossfadeMs);
  }

  stop(fadeMs?: number): MusicManagerAPI {
    const thisStopRequestKey = ++this.currentRampRequestKey;

    this.currentlyPlayingMusicKey = undefined;
    this.hasCrossfadeInProgress = false;

    const resolvedFadeMs = fadeMs ?? 500;

    this.soundManager.rampParam(this.musicSlotA.gain.gain, 0, resolvedFadeMs);
    this.soundManager.rampParam(this.musicSlotB.gain.gain, 0, resolvedFadeMs);

    setTimeout(() => {
      if (thisStopRequestKey !== this.currentRampRequestKey) return;

      this.musicSlotA.stop();
      this.musicSlotB.stop();
    }, resolvedFadeMs);

    return this;
  }

  getVolume(): number {
    return this.targetVolume;
  }
  setVolume(value: number): MusicManagerAPI {
    this.targetVolume = value;

    const currentOrFutureActiveSlot = this._getCurrentOrSoonToBeActiveSlot();

    this.soundManager.rampParam(
      currentOrFutureActiveSlot.gain.gain,
      value * this.currentMusicGain,
      30
    );

    return this;
  }

  getIsLooping(): boolean {
    return this.musicSlotA.loop;
  }
  setIsLooping(isLooping: boolean): MusicManagerAPI {
    this.musicSlotA.loop = isLooping;
    this.musicSlotB.loop = isLooping;

    return this;
  }

  /*
  duckMusic(tagetVolume: number, fadeMs: number): void;
  unduckMusic(fadeMs: number): void;
  */

  private _getActiveSlot(): Audio {
    return this.activeSlot === "A" ? this.musicSlotA : this.musicSlotB;
  }

  private _getCurrentOrSoonToBeActiveSlot(): Audio {
    if (!this.hasCrossfadeInProgress) return this._getActiveSlot();
    else return this._getInactiveSlot();
  }

  private _getInactiveSlot(): Audio {
    return this.activeSlot === "A" ? this.musicSlotB : this.musicSlotA;
  }

  private _swapActiveSlot(): void {
    if (this.activeSlot === "A") this.activeSlot = "B";
    else this.activeSlot = "A";
  }
}

class SoundManager implements SoundManagerAPI {
  private readonly listener!: AudioListener;
  private readonly audioBusses!: Record<SoundType, GainNode>;
  private readonly muteAllAudioNode!: GainNode;

  public readonly music!: MusicManagerAPI;

  constructor() {
    // WARN: this guards against web workers importing this module
    if (typeof window === "undefined") return;

    this.listener = new AudioListener();
    const ctx = this.listener.context;

    this.audioBusses = {
      [SoundType.SFX]: ctx.createGain(),
      [SoundType.Music]: ctx.createGain(),
      [SoundType.Ambiance]: ctx.createGain(),
      [SoundType.UI]: ctx.createGain()
    };

    this.muteAllAudioNode = ctx.createGain();
    for (const audioBus of Object.values(this.audioBusses)) {
      audioBus.connect(this.muteAllAudioNode);
    }

    const listenerInput = this.listener.getInput();
    this.muteAllAudioNode.connect(listenerInput);

    this.music = new MusicManager(this);
  }

  getListener(): AudioListener {
    return this.listener;
  }

  routeSoundThroughBus(audio: Audio<AudioNode>, busType: SoundType): void {
    audio.gain.disconnect();
    audio.gain.connect(this.audioBusses[busType]);
  }

  playOneShot(
    soundKey: keyof SoundAssets,
    soundType: SoundType
  ): SoundManagerAPI {
    const soundBuffer = getAsset(soundKey);

    const oneShotAudio = new Audio(this.listener);
    this.routeSoundThroughBus(oneShotAudio, soundType);

    oneShotAudio.setBuffer(soundBuffer);

    oneShotAudio.onEnded = () => oneShotAudio.gain.disconnect();

    oneShotAudio.play();

    return this;
  }

  rampParam(param: AudioParam, target: number, fadeMs: number): void {
    const ctx = this.listener.context;
    const now = ctx.currentTime;
    const fadeSecs = fadeMs / 1000;

    param.cancelScheduledValues(now);

    if (fadeSecs <= 0) {
      param.value = target;
      return;
    }

    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + fadeSecs);
  }

  getMasterVolume(): number {
    return this.listener.getMasterVolume();
  }
  setMasterVolume(value: number): SoundManagerAPI {
    this.rampParam(this.listener.gain.gain, value, 30);

    return this;
  }

  getAudioBusVolume(busType: SoundType): number {
    return this.audioBusses[busType].gain.value;
  }
  setAudioBusVolume(busType: SoundType, value: number): SoundManagerAPI {
    this.rampParam(this.audioBusses[busType].gain, value, 30);

    return this;
  }

  mute(): SoundManagerAPI {
    this.rampParam(this.muteAllAudioNode.gain, 0, 30);

    return this;
  }
  unmute(): SoundManagerAPI {
    this.rampParam(this.muteAllAudioNode.gain, 1, 30);

    return this;
  }
}

export const centralSoundManager = new SoundManager();

abstract class BaseSound<AudioType extends Audio<AudioNode>>
  implements SoundAPI<AudioType>
{
  protected abstract instantiateVoice(): AudioType;
  protected abstract disposeVoice(voice: AudioType): void;
  protected createVoiceHook(_voice: AudioType): void {}

  /*
   * WARN: for best results, this should be called at the end of ALL subclasses' constructors
   * WARN: this cannot be done in the base class because voice creation relies on the create voice hooks of subclasses
   */
  protected preWarmVoicePool(): void {
    for (
      let soundBufferIdx = 0;
      soundBufferIdx < this.soundBuffers.length;
      soundBufferIdx++
    ) {
      this._createVoiceFromSoundBufferIdx(soundBufferIdx);
    }
  }

  private readonly soundBuffers: readonly [AudioBuffer, ...AudioBuffer[]];
  private readonly reversedSoundBuffers: readonly [
    AudioBuffer,
    ...AudioBuffer[]
  ];
  private readonly soundType: SoundType;

  private volume = 1;
  private detune = 0;
  private pitchVariation = 0;
  private playbackRate = 1;
  private actualPlaybackRate = 1;
  private isLooping = false;

  protected readonly voicePool: AudioType[] = [];

  constructor(
    soundType: SoundType,
    ...soundBuffers: [AudioBuffer, ...AudioBuffer[]]
  ) {
    this.soundBuffers = soundBuffers;
    this.soundType = soundType;

    this.reversedSoundBuffers = this.soundBuffers.map((buffer) =>
      createReversedAudioBuffer(buffer)
    ) as unknown as readonly [AudioBuffer, ...AudioBuffer[]];
  }

  play(): void {
    const randomAvailableVoice =
      this._getRandomAvailableVoice() ?? this._createVoice();

    const randomDetuneVariationAmount =
      2 * (Math.random() - 0.5) * this.pitchVariation;
    const randomDetune = this.detune + randomDetuneVariationAmount;

    randomAvailableVoice.setDetune(randomDetune);

    randomAvailableVoice.play();
  }

  private _getRandomAvailableVoice(): AudioType | undefined {
    const availableVoices = this.voicePool.filter((voice) => !voice.isPlaying);

    if (availableVoices.length <= 0) return undefined;

    const randomAvailableVoiceIdx = Math.floor(
      Math.random() * availableVoices.length
    );
    return availableVoices[randomAvailableVoiceIdx];
  }

  private _createVoice(): AudioType {
    const randomSoundBufferIdx = Math.floor(
      Math.random() * this.soundBuffers.length
    );
    return this._createVoiceFromSoundBufferIdx(randomSoundBufferIdx);
  }

  private _createVoiceFromSoundBufferIdx(soundBufferIdx: number): AudioType {
    const audio = this.instantiateVoice();
    centralSoundManager.routeSoundThroughBus(audio, this.soundType);

    const isNotReversed = this.playbackRate >= 0;

    const soundBuffer = isNotReversed
      ? this.soundBuffers[soundBufferIdx]
      : this.reversedSoundBuffers[soundBufferIdx];

    audio
      .setBuffer(soundBuffer)
      .setVolume(this.volume)
      .setDetune(this.detune)
      .setPlaybackRate(this.actualPlaybackRate)
      .setLoop(this.isLooping);

    this.createVoiceHook(audio);

    this.voicePool.push(audio);

    return audio;
  }

  dispose(fadeMs?: number): void {
    const resolvedFadeMs = fadeMs ?? 0;

    for (const voice of this.voicePool) {
      centralSoundManager.rampParam(voice.gain.gain, 0, resolvedFadeMs);

      setTimeout(() => {
        this.disposeVoice(voice);
      }, resolvedFadeMs);
    }

    this.voicePool.length = 0;
  }

  pause(): SoundAPI<AudioType> {
    for (const voice of this.voicePool) voice.pause();

    return this;
  }
  stop(): SoundAPI<AudioType> {
    for (const voice of this.voicePool) voice.stop();

    return this;
  }

  getDetune(): number {
    return this.detune;
  }
  setDetune(value: number): SoundAPI<AudioType> {
    this.detune = value;

    for (const voice of this.voicePool) {
      const randomDetuneVariationAmount =
        2 * (Math.random() - 0.5) * this.pitchVariation;
      const randomDetune = this.detune + randomDetuneVariationAmount;

      voice.setDetune(randomDetune);
    }

    return this;
  }

  getPitchVariation(): number {
    return this.pitchVariation;
  }
  setPitchVariation(value: number): SoundAPI<AudioType> {
    this.pitchVariation = value;
    return this;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }
  setPlaybackRate(value: number): SoundAPI<AudioType> {
    const previousPlaybackRate = this.playbackRate;
    this.playbackRate = value;
    this.actualPlaybackRate = Math.abs(value);

    const hasChangedToReverseAudio = previousPlaybackRate >= 0 && value < 0;
    const hasChangedToNormalAudio = previousPlaybackRate < 0 && value >= 0;
    const hasAudioInversionOccured =
      hasChangedToReverseAudio || hasChangedToNormalAudio;

    for (const voice of this.voicePool) {
      voice.setPlaybackRate(this.actualPlaybackRate);

      if (hasAudioInversionOccured) {
        const originalBufferArray = hasChangedToReverseAudio
          ? this.soundBuffers
          : this.reversedSoundBuffers;

        const newInvertedBufferArray =
          originalBufferArray === this.soundBuffers
            ? this.reversedSoundBuffers
            : this.soundBuffers;

        const originalAudioBuffer = voice.buffer;
        if (!originalAudioBuffer) continue;

        const originalBufferIdx =
          originalBufferArray.indexOf(originalAudioBuffer);
        if (originalBufferIdx < 0) continue;

        const newAudioBuffer = newInvertedBufferArray[originalBufferIdx];
        voice.setBuffer(newAudioBuffer);
      }
    }

    return this;
  }

  getVolume(): number {
    return this.volume;
  }
  setVolume(value: number, fadeMs?: number): SoundAPI<AudioType> {
    this.volume = value;

    for (const voice of this.voicePool)
      centralSoundManager.rampParam(voice.gain.gain, value, fadeMs ?? 30);

    return this;
  }

  getIsLooping(): boolean {
    return this.isLooping;
  }
  setIsLooping(isLooping: boolean): SoundAPI<AudioType> {
    this.isLooping = isLooping;

    for (const voice of this.voicePool) voice.setLoop(isLooping);

    return this;
  }

  getLongestBufferDurationMs(): number {
    const longestDurationSec = this.soundBuffers.reduce(
      (longestDuration: number, currentSoundBuffer: AudioBuffer) => {
        const currentDuration = currentSoundBuffer.duration;

        if (currentDuration > longestDuration) return currentDuration;

        return longestDuration;
      },
      0
    );

    return longestDurationSec * 1000;
  }

  isPlaying(): boolean {
    for (const voice of this.voicePool) if (voice.isPlaying) return true;

    return false;
  }

  /*
   * FUTURE QOL OTHER THAN THREEJS WRAPPING GOES HERE.
   * Such as random pitch variation, fade in and fade out helpers, audio filters, etc.
   */
}

export class Sound extends BaseSound<Audio> {
  constructor(
    soundType: SoundType,
    ...soundBuffers: [AudioBuffer, ...AudioBuffer[]]
  ) {
    super(soundType, ...soundBuffers);

    this.preWarmVoicePool();
  }

  protected instantiateVoice(): Audio {
    return new Audio(centralSoundManager.getListener());
  }

  protected disposeVoice(voice: Audio<GainNode>): void {
    voice.stop();
    voice.gain.disconnect();
  }
}

export class PositionalSound extends BaseSound<PositionalAudio> {
  private readonly parent: Object3D;

  private refDistance = 10;
  private rollOffFactor = 10;
  private offset = new Vector2();

  constructor(
    soundType: SoundType,
    parent: Object3D,
    ...soundBuffers: [AudioBuffer, ...AudioBuffer[]]
  ) {
    super(soundType, ...soundBuffers);

    this.parent = parent;

    this.preWarmVoicePool();
  }

  protected instantiateVoice(): PositionalAudio {
    return new PositionalAudio(centralSoundManager.getListener());
  }

  protected disposeVoice(voice: PositionalAudio): void {
    voice.stop();
    voice.gain.disconnect();
    voice.parent?.remove(voice);
  }

  protected createVoiceHook(voice: PositionalAudio): void {
    voice
      .setDistanceModel("exponential")
      .setRefDistance(this.refDistance)
      .setRolloffFactor(this.rollOffFactor);

    this.parent.add(voice);

    voice.position.x = this.offset.x;
    voice.position.y = this.offset.y;
  }

  getRefDistance(): number {
    return this.refDistance;
  }
  setRefDistance(value: number): SoundAPI<PositionalAudio> {
    this.refDistance = value;

    for (const voice of this.voicePool) voice.setRefDistance(value);

    return this;
  }

  getRollOffFactor(): number {
    return this.rollOffFactor;
  }
  setRollOffFactor(value: number): SoundAPI<PositionalAudio> {
    this.rollOffFactor = value;

    for (const voice of this.voicePool) voice.setRolloffFactor(value);

    return this;
  }

  getOffset(): Vector2 {
    return this.offset.clone();
  }
  setOffset(xOffset: number, yOffset: number): SoundAPI<PositionalAudio> {
    this.offset.set(xOffset, yOffset);

    for (const voice of this.voicePool) {
      voice.position.x = xOffset;
      voice.position.y = yOffset;
    }

    return this;
  }
}
