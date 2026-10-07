import { RegistryProvider } from "src/api/registry";

import pixel12 from "../assets/music/Pixel 12.mp3";

export class MusicSourceRegistry implements RegistryProvider<string> {
  private _mapping = new Map<string, string>();
  keys() {
    return [...this._mapping.keys()];
  }
  get(key: string) {
    return this._mapping.get(key) ?? null;
  }
  add(key: string, value: string) {
    this._mapping.set(key, value);
  }
}

export class MusicBufferRegistry implements RegistryProvider<AudioBuffer> {
  private _mapping = new Map<string, AudioBuffer>();
  keys() {
    return [...this._mapping.keys()];
  }
  get(key: string) {
    return this._mapping.get(key) ?? null;
  }
  add(key: string, value: AudioBuffer) {
    this._mapping.set(key, value);
  }
}

export const musicSourceRegistry = new MusicSourceRegistry();
export const musicBufferRegistry = new MusicBufferRegistry();

musicSourceRegistry.add("pixel12", pixel12);
