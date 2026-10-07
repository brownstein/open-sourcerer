import RAPIER from "@dimforge/rapier2d";
import { EventEmitter } from "events";
import { Blob as HBBlob } from "harfbuzzjs";
import { ProtoSpriteGeometry } from "protosprite-geom";
import {
  ProtoSpriteSheetThree,
  ProtoSpriteSheetThreeLoader
} from "protosprite-three";
import {
  AudioLoader,
  LinearSRGBColorSpace,
  NearestFilter,
  Texture,
  TextureLoader
} from "three";

import { Loader, ResourceDefinition } from "src/api/loader";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";

export const kDefaultResourceSize = 100;
const gTextureLoader = new TextureLoader();
const gAudioLoader = new AudioLoader();

export abstract class AbstractLoader<T>
  extends EventEmitter
  implements Loader<T>
{
  public resource?: T;
  public resourceName: string;
  public resourceSize: number = kDefaultResourceSize;
  public resourceProgress = 0;
  public completionPromise: Promise<T>;
  protected resolve?: (arg: T | PromiseLike<T>) => void;
  protected reject?: (err: Error) => void;
  protected loadInProgress = false;
  constructor(resourceName: string) {
    super();
    this.resourceName = resourceName;
    this.completionPromise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  abstract load(): Promise<T>;

  async unload(): Promise<void> {
    if (!this.resource && !this.loadInProgress) return;

    if (this.loadInProgress) {
      try {
        await this.completionPromise;
      } catch {}
    }

    if (this.resource) this.disposeResource(this.resource);

    this.resource = undefined;
    this.loadInProgress = false;
    this.resourceSize = kDefaultResourceSize;
    this.resourceProgress = 0;
    this.completionPromise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  protected disposeResource(_resource: T): void {}
}

export class GenericLoader<
  T,
  GetResource extends () => Promise<T> = () => Promise<T>,
  DisposeCallback extends (resource: T) => void = (resource: T) => void
> extends AbstractLoader<T> {
  private getResource: GetResource;
  private disposeCallback?: DisposeCallback;
  constructor(
    resourceName: string,
    getResource: GetResource,
    disposeCallback?: DisposeCallback
  ) {
    super(resourceName);
    this.getResource = getResource;
    this.disposeCallback = disposeCallback;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const resource = await this.getResource();
    this.resource = resource;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(resource);
    return resource;
  }
  protected disposeResource(resource: T): void {
    this.disposeCallback?.(resource);
  }
}

export class TextureResourceLoader extends AbstractLoader<Texture> {
  private resourceUrl: string;
  private triedFetchFallback = false;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    gTextureLoader.load(
      this.resourceUrl,
      (texture) => {
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.colorSpace = LinearSRGBColorSpace;
        this.resource = texture;
        this.loadInProgress = false;
        this.resolve?.(texture);
        this.emit("progress", this);
        this.emit("complete", texture);
      },
      (event) => {
        this.resourceSize = event.total;
        this.resourceProgress = event.loaded / event.total;
        this.emit("progress", this);
      },
      () => {
        // Attempt a one-time fetch() fallback to handle dev server/static path hiccups
        if (!this.triedFetchFallback) {
          this.triedFetchFallback = true;
          (async () => {
            try {
              const resp = await fetch(this.resourceUrl, { mode: "cors" });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const blob = await resp.blob();
              const objectUrl = URL.createObjectURL(blob);
              gTextureLoader.load(
                objectUrl,
                (texture) => {
                  URL.revokeObjectURL(objectUrl);
                  texture.magFilter = NearestFilter;
                  texture.minFilter = NearestFilter;
                  texture.colorSpace = LinearSRGBColorSpace;
                  this.resource = texture;
                  this.loadInProgress = false;
                  this.resolve?.(texture);
                  this.emit("progress", this);
                  this.emit("complete", texture);
                },
                undefined,
                () => {
                  URL.revokeObjectURL(objectUrl);
                  this.resourceProgress = 0;
                  this.loadInProgress = false;
                  this.emit("failure");
                  this.reject?.(
                    new Error(
                      `Failed to load texture ${this.resourceName} from ${this.resourceUrl}`
                    )
                  );
                }
              );
              return;
            } catch (_) {
              // fall through to final reject below
            }
            this.resourceProgress = 0;
            this.emit("failure");
            this.reject?.(
              new Error(
                `Failed to load texture ${this.resourceName} from ${this.resourceUrl}`
              )
            );
          })();
          return;
        }
        this.resourceProgress = 0;
        this.emit("failure");
        this.reject?.(
          new Error(
            `Failed to load texture ${this.resourceName} from ${this.resourceUrl}`
          )
        );
      }
    );
    return this.completionPromise;
  }
  protected disposeResource(resource: Texture): void {
    resource.dispose();
    this.triedFetchFallback = false;
  }
}

export class AudioResourceLoader extends AbstractLoader<AudioBuffer> {
  private resourceUrl: string;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    gAudioLoader.load(
      this.resourceUrl,
      (audio) => {
        this.resource = audio;
        this.loadInProgress = false;
        this.resolve?.(audio);
        this.emit("progress", this);
        this.emit("complete", audio);
      },
      (event) => {
        this.resourceSize = event.total;
        this.resourceProgress = event.loaded / event.total;
        this.emit("progress", this);
      },
      () => {
        this.resourceProgress = 0;
        this.loadInProgress = false;
        this.emit("failure");
        this.reject?.(
          new Error(
            `Failed to load audio ${this.resourceName} from ${this.resourceUrl}`
          )
        );
      }
    );
    return this.completionPromise;
  }
}

export class ProtoSpriteLoader extends AbstractLoader<ProtoSpriteSheetThree> {
  private internalLoader = new ProtoSpriteSheetThreeLoader();
  private resourceUrl: string;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceSize = 100;
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    this.resource = await this.internalLoader.loadAsync(this.resourceUrl);
    this.loadInProgress = false;
    this.resourceProgress = 1;
    this.resolve?.(this.resource);
    this.emit("complete", this.resource);
    return this.resource;
  }
  protected disposeResource(resource: ProtoSpriteSheetThree): void {
    resource.dispose();
    this.internalLoader = new ProtoSpriteSheetThreeLoader();
  }
}

export class ChainLoader<
    InputType,
    OutputType,
    SubLoader extends Loader<InputType>
  >
  extends AbstractLoader<OutputType>
  implements Loader<OutputType>
{
  private subLoader: SubLoader;
  private transformer: (
    input: InputType
  ) => OutputType | PromiseLike<OutputType>;
  constructor(
    resourceName: string,
    subLoader: SubLoader,
    transformer: (input: InputType) => OutputType | PromiseLike<OutputType>
  ) {
    super(resourceName);
    this.subLoader = subLoader;
    this.resourceSize = subLoader.resourceSize;
    this.transformer = transformer;
    this.subLoader.on("progress", () => {
      this.resourceSize = this.subLoader.resourceSize;
      if (this.resourceProgress !== this.subLoader.resourceProgress) {
        this.resourceProgress = this.subLoader.resourceProgress;
        this.emit("progress", this);
      }
    });
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const input = await this.subLoader.load();
    const resource = await this.transformer(input);
    this.resource = resource;
    const previousResourceProgress = this.resourceProgress;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(resource);
    if (this.resourceProgress !== previousResourceProgress) {
      this.emit("progress", this);
    }
    this.emit("complete", resource);
    return resource;
  }
  // TODO: I do not think this is right, for there to be no disposing, but this
  // loader is used nowhere else so this is fine
}

export class MultiLoader<
  SubLoaders extends {
    [K in keyof T]: Loader<T[K]>;
  },
  T extends {
    [K in keyof SubLoaders]: Exclude<SubLoaders[K]["resource"], undefined>;
  }
> extends AbstractLoader<T> {
  private subLoaders: SubLoaders;
  constructor(resourceName: string, subLoaders: SubLoaders) {
    super(resourceName);
    this.subLoaders = subLoaders;
    this._recalculateProgress = this._recalculateProgress.bind(this);
    for (const [_resourceName, subLoader] of Object.entries(
      this.subLoaders
    ) as Iterable<[string, Loader<unknown>]>) {
      subLoader.on("progress", this._recalculateProgress);
    }
  }
  private _recalculateProgress() {
    let totalSize = 0;
    let totalProgress = 0;
    for (const subLoader2 of Object.values(this.subLoaders) as Iterable<
      Loader<unknown>
    >) {
      totalSize += subLoader2.resourceSize;
      totalProgress += subLoader2.resourceSize * subLoader2.resourceProgress;
    }
    const resourceProgress = totalProgress / totalSize;
    if (
      totalSize !== this.resourceSize ||
      resourceProgress !== this.resourceProgress
    ) {
      this.resourceSize = totalSize;
      this.resourceProgress = resourceProgress;
      this.emit("progress", this);
    }
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const allWork: Promise<[string, unknown]>[] = [];
    for (const [resourceName, subLoader] of Object.entries(
      this.subLoaders
    ) as Iterable<[string, Loader<unknown>]>) {
      allWork.push(subLoader.load().then((res) => [resourceName, res]));
    }
    const completedWork = await Promise.all(allWork);
    const partialResource: Partial<T> = {};
    for (const [resourceName, resource] of completedWork) {
      partialResource[resourceName as keyof T] = resource as T[keyof T];
    }
    const resource = partialResource as T;
    this.resource = resource;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(resource);
    this.emit("progress", this);
    this.emit("complete", resource);
    for (const subLoader of Object.values(
      this.subLoaders
    ) as Iterable<Loader>) {
      subLoader.off("progress", this._recalculateProgress);
    }
    return resource;
  }
}

export class ProtoSpriteGeometryLoader extends AbstractLoader<ProtoSpriteGeometry> {
  private resourceUrl: string;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const resp = await fetch(this.resourceUrl);
    if (!resp.ok) {
      this.reject?.(
        new Error(
          `Failed to load geometry ${this.resourceName} from ${this.resourceUrl}`
        )
      );
      this.loadInProgress = false;
      return this.completionPromise;
    }
    const arrayBuffer = await resp.arrayBuffer();
    const geom = ProtoSpriteGeometry.fromArray(new Uint8Array(arrayBuffer));
    this.resource = geom;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(geom);
    this.emit("complete", geom);
    return geom;
  }
}

export class ThreeTTFFontLoader extends AbstractLoader<Font> {
  private resourceUrl: string;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const ttfLoader = new TTFLoader();
    const fontData = await ttfLoader.loadAsync(this.resourceUrl);
    this.resource = new Font(fontData);
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(this.resource);
    this.emit("complete", this.resource);
    return this.resource;
  }
}

export class HarfbuzzBlobLoader extends AbstractLoader<HBBlob> {
  private resourceUrl: string;
  constructor(resourceName: string, resourceUrl: string) {
    super(resourceName);
    this.resourceUrl = resourceUrl;
  }
  async load() {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;
    const resp = await fetch(this.resourceUrl);
    if (!resp.ok) {
      this.reject?.(
        new Error(
          `Failed to load geometry ${this.resourceName} from ${this.resourceUrl}`
        )
      );
      this.loadInProgress = false;
      return this.completionPromise;
    }
    const arrayBuffer = await resp.arrayBuffer();
    const resource = new HBBlob(arrayBuffer);
    this.resource = resource;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(resource);
    this.emit("complete", resource);
    return resource;
  }
}

export class RapierLoader extends AbstractLoader<typeof RAPIER> {
  async load() {
    this.resource = await import("@dimforge/rapier2d");
    this.resolve?.(this.resource);
    return this.resource;
  }
}

export type DependencyClassType<T = unknown> = {
  new (...props: any[]): T;
  type: string;
} & ResourceDefinition;

export class ClazzDependencyLoader<
  T extends DependencyClassType
> extends AbstractLoader<T> {
  private clazzMultiLoader?: MultiLoader<
    Record<string, Loader>,
    Record<string, unknown>
  >;
  constructor(clazz: T) {
    super(clazz.type);
    this.resource = clazz;
  }
  async load() {
    const resource = this.resource;
    if (!resource) throw new Error("Target class is somehow missing.");
    if (!resource.loaders) return resource;
    this.clazzMultiLoader = new MultiLoader(resource.type, resource.loaders);
    await this.clazzMultiLoader.load();
    this.resolve?.(resource);
    return resource;
  }
}
