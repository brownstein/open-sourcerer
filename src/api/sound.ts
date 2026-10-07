import { Audio, AudioListener } from "three";

import { MusicAssets } from "src/assets/allMusicAssets";
import { SoundAssets } from "src/assets/allSoundAssets";

export enum SoundType {
  SFX = "SFX",
  Music = "Music",
  Ambiance = "Ambiance",
  UI = "UI"
}

export interface SoundAPI<
  AudioType extends Audio<AudioNode> = Audio<AudioNode>
> {
  play(): void;
  pause(): SoundAPI<AudioType>;
  stop(): SoundAPI<AudioType>;
  dispose(fadeMs?: number): void;

  getDetune(): number;
  setDetune(value: number): SoundAPI<AudioType>;

  getPitchVariation(): number;
  setPitchVariation(value: number): SoundAPI<AudioType>;

  getPlaybackRate(): number;
  setPlaybackRate(value: number): SoundAPI<AudioType>;

  getVolume(): number;
  setVolume(value: number, fadeMs?: number): SoundAPI<AudioType>;

  getIsLooping(): boolean;
  setIsLooping(isLooping: boolean): SoundAPI<AudioType>;

  getLongestBufferDurationMs(): number;

  isPlaying(): boolean;

  /*
   * FUTURE QOL OTHER THAN THREEJS WRAPPING GOES HERE.
   * Such as random pitch variation, fade in and fade out helpers, audio filters, etc.
   */
}

export interface MusicManagerAPI {
  play(
    musicKey: keyof MusicAssets,
    musicGain?: number,
    crossfadeMs?: number
  ): void;
  stop(fadeMs?: number): MusicManagerAPI;

  getVolume(): number;
  setVolume(value: number): MusicManagerAPI;

  getIsLooping(): boolean;
  setIsLooping(isLooping: boolean): MusicManagerAPI;

  /*
  duckMusic(tagetVolume: number, fadeMs: number): void;
  unduckMusic(fadeMs: number): void;
  */
}

export interface SoundManagerAPI {
  readonly music: MusicManagerAPI;

  getListener(): AudioListener;

  routeSoundThroughBus(audio: Audio<AudioNode>, busType: SoundType): void;

  playOneShot(
    soundKey: keyof SoundAssets,
    soundType: SoundType
  ): SoundManagerAPI;

  rampParam(param: AudioParam, target: number, fadeMs: number): void;

  getMasterVolume(): number;
  setMasterVolume(value: number): SoundManagerAPI;

  getAudioBusVolume(busType: SoundType): number;
  setAudioBusVolume(busType: SoundType, value: number): SoundManagerAPI;

  mute(): SoundManagerAPI;
  unmute(): SoundManagerAPI;
}
