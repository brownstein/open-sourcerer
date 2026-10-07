import { SkeletonBinary } from "@esotericsoftware/spine-core";
import {
  AssetManager,
  AtlasAttachmentLoader,
  SkeletonData,
  SkeletonJson
} from "@esotericsoftware/spine-threejs";

import { AbstractLoader } from "../loader/Loaders";

export type SpineLoaderProps = {
  resourceName: string;
  sourcePngName?: string;
  sourcePngPath: string;
  sourceAtlasPath: string;
  sourceJson?: unknown;
  sourceSkelPath?: string;
};

/**
 * Wraps an AtlasAttachmentLoader to return null instead of throwing
 * when a region/mesh is not found in the atlas. The SkeletonBinary
 * parser gracefully skips null attachments.
 */
function makeTolerant(loader: AtlasAttachmentLoader): AtlasAttachmentLoader {
  const origRegion = loader.newRegionAttachment.bind(loader);
  const origMesh = loader.newMeshAttachment.bind(loader);
  loader.newRegionAttachment = (...args: Parameters<typeof origRegion>) => {
    try {
      return origRegion(...args);
    } catch {
      return null as any;
    }
  };
  loader.newMeshAttachment = (...args: Parameters<typeof origMesh>) => {
    try {
      return origMesh(...args);
    } catch {
      return null as any;
    }
  };
  return loader;
}

export class SpineLoader extends AbstractLoader<SkeletonData> {
  private props: SpineLoaderProps;
  private spineAssetManager?: AssetManager;

  constructor(props: SpineLoaderProps) {
    super(props.resourceName);
    this.props = props;
  }

  async load(): Promise<SkeletonData> {
    if (this.resource) return this.resource;
    if (this.loadInProgress) return this.completionPromise;
    this.loadInProgress = true;

    const {
      sourcePngName = "skeleton.png",
      sourcePngPath,
      sourceAtlasPath,
      sourceJson,
      sourceSkelPath
    } = this.props;

    const assetManager = new AssetManager();
    assetManager.loadTextureAtlas(sourceAtlasPath, undefined, undefined, {
      [sourcePngName]: sourcePngPath
    });
    await assetManager.loadAll();

    this.spineAssetManager = assetManager;

    const atlas = assetManager.require(sourceAtlasPath);
    const atlasLoader = new AtlasAttachmentLoader(atlas);

    let skeletonData: SkeletonData;
    if (sourceSkelPath) {
      const response = await fetch(sourceSkelPath);
      const buffer = await response.arrayBuffer();
      const skeletonBinary = new SkeletonBinary(makeTolerant(atlasLoader));
      skeletonData = skeletonBinary.readSkeletonData(new Uint8Array(buffer));
    } else {
      const skeletonJson = new SkeletonJson(atlasLoader);
      skeletonData = skeletonJson.readSkeletonData(sourceJson);
    }

    this.resource = skeletonData;
    this.resourceProgress = 1;
    this.loadInProgress = false;
    this.resolve?.(skeletonData);
    return skeletonData;
  }

  protected disposeResource(_resource: SkeletonData): void {
    this.spineAssetManager?.dispose();
    this.spineAssetManager = undefined;
  }
}
