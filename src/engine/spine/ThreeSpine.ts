import { AnimationState, AnimationStateData, MeshAttachment, Physics, RegionAttachment, Skeleton, SkeletonData } from "@esotericsoftware/spine-core";
import { ThreeJsTexture } from "@esotericsoftware/spine-threejs";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, NearestFilter, ShaderMaterial, Texture, Vector2, Vector4 } from "three";

import { createTypedEventEmitter } from "src/api/util";

import fragmentShader from "./ThreeSpineFrag.glsl";
import vertexShader from "./ThreeSpineVert.glsl";

export enum ThreeSpineEvents {
  AddAttachment = "AddAttachment",
  RemoveAttachment = "RemoveAttachment",
  AnimationComplete = "AnimationComplete"
}

export type AttachmentToggleData = {
  slotName: string;
  attachmentName: string;
};

export type ThreeSpineEventTypes = {
  [ThreeSpineEvents.AddAttachment]: AttachmentToggleData;
  [ThreeSpineEvents.RemoveAttachment]: AttachmentToggleData;
  [ThreeSpineEvents.AnimationComplete]: string;
};

const kQuadTriangles = [0, 1, 2, 2, 3, 0];

export type ThreeColorRepresentation = Color | string | number;

export type ThreeSpineShaderOverride = {
  opacity?: number;
  color?: ThreeColorRepresentation;
  fadeColor?: ThreeColorRepresentation;
  fadeAmount?: number;
  outlineColor?: ThreeColorRepresentation;
  outlineAmount?: number;
};

export type ThreeSpineRegionOverrider = (
  regionAttachmentName: string,
  position: Vector2,
  size: Vector2
) => void;

/**
 * Simplified geometry rendering for Spine2D objects.
 * This currently assumes we're working with RegionAttachments,
 * support for MeshAttachments will be added later.
 */
export class ThreeSpine {
  public skeleton: Skeleton;
  public animationStateData: AnimationStateData;
  public animationState: AnimationState;
  public geometry = new BufferGeometry();
  public material: ShaderMaterial;
  public mesh: Mesh;
  public events = createTypedEventEmitter<ThreeSpineEventTypes>();
  private currentVertexCount: number;
  private currentIndexCount: number;
  private indexArr: Uint16Array;
  private posArr: Float32Array;
  private uvArr: Float32Array;
  private colorArr: Float32Array;
  private opacityArr: Float32Array;
  private fadeArr: Float32Array;
  private outlineArr: Float32Array;
  private slotAttachments = new Map<string, string>();
  private outlineSpread = 1;
  private invTextureSize = new Vector2();
  private slotShaderOverrides = new Map<string, ThreeSpineShaderOverride>();
  private regionOverrider?: ThreeSpineRegionOverrider;
  constructor(data: SkeletonData) {
    this.skeleton = new Skeleton(data);
    this.animationStateData = new AnimationStateData(data);
    this.animationState = new AnimationState(this.animationStateData);

    this.animationState.apply(this.skeleton);
    this.skeleton.updateWorldTransform(Physics.update);

    // Wire up events from the animation state.
    this.animationState.addListener({
      complete: (entry) => {
        this.events.emit(ThreeSpineEvents.AnimationComplete, entry.animation?.name ?? "");
      }
    });

    // Extract one, and only one, material.
    // This will be the first material we find;
    // we are relying on there being a central
    // texture atlas that covers all slots.
    let texture: Texture | undefined;
    for (const slot of this.skeleton.slots) {
      const attachment = slot.getAttachment();
      if (!attachment) continue;
      if (attachment instanceof RegionAttachment) {
        const regionTexture = attachment.region?.texture as
          | ThreeJsTexture
          | null
          | undefined;
        if (regionTexture?.texture) {
          texture = regionTexture.texture;
          break;
        }
      }
    }
    if (texture) {
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      this.invTextureSize.x =
        1 / (texture.image as HTMLImageElement).naturalWidth;
      this.invTextureSize.y =
        1 / (texture.image as HTMLImageElement).naturalHeight;
    }
    this.material = new ShaderMaterial({
      fragmentShader,
      vertexShader,
      uniforms: {
        map: {
          value: texture
        },
        opacity: {
          value: 1
        },
        outlineSpread: {
          value: this.invTextureSize.clone().multiplyScalar(this.outlineSpread)
        },
        color: {
          value: new Color(1, 1, 1)
        },
        fade: {
          value: new Vector4(0, 0, 0, 0)
        }
      },
      transparent: true,
      side: DoubleSide
    });

    const [vertexCount, indexCount] = this.computeVertexAndIndexCounts();
    this.currentVertexCount = vertexCount;
    this.currentIndexCount = indexCount;

    const indexArr = new Uint16Array(indexCount);
    const posArr = new Float32Array(vertexCount * 3);
    const uvArr = new Float32Array(vertexCount * 2);
    const colorArr = new Float32Array(vertexCount * 3);
    const opacityArr = new Float32Array(vertexCount);
    opacityArr.fill(1);
    const fadeArr = new Float32Array(vertexCount * 4);
    const outlineArr = new Float32Array(vertexCount * 4);
    this.updateArrays(
      indexArr,
      posArr,
      uvArr,
      colorArr,
      opacityArr,
      fadeArr,
      outlineArr
    );
    this.indexArr = indexArr;
    this.posArr = posArr;
    this.uvArr = uvArr;
    this.colorArr = colorArr;
    this.opacityArr = opacityArr;
    this.fadeArr = fadeArr;
    this.outlineArr = outlineArr;
    this.geometry.name = "__ThreeSpineGeometry__";
    this.geometry.setIndex(new BufferAttribute(indexArr, 1));
    this.geometry.setAttribute("position", new BufferAttribute(posArr, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(uvArr, 2));
    this.geometry.setAttribute("vtxColor", new BufferAttribute(colorArr, 3));
    this.geometry.setAttribute(
      "vtxOpacity",
      new BufferAttribute(opacityArr, 1)
    );
    this.geometry.setAttribute("vtxFade", new BufferAttribute(fadeArr, 4));
    this.geometry.setAttribute(
      "vtxOutline",
      new BufferAttribute(outlineArr, 4)
    );
    this.update(0);

    this.mesh = new Mesh(this.geometry, this.material);
  }
  private computeVertexAndIndexCounts() {
    let quadCount = 0;
    let meshVtxCount = 0;
    let meshIndexCount = 0;
    for (const slot of this.skeleton.drawOrder) {
      const attachment = slot.getAttachment();
      if (!attachment) continue;
      // Support region attachments.
      if (attachment instanceof RegionAttachment) {
        quadCount++;
        continue;
      }
      if (attachment instanceof MeshAttachment) {
        meshVtxCount += attachment.vertices.length;
        meshIndexCount += attachment.triangles.length;
        continue;
      }
    }
    const vertexCount = quadCount * 4 + meshVtxCount;
    const indexCount = quadCount * 6 + meshIndexCount;
    return [vertexCount, indexCount];
  }
  public preWorldTransform?: () => void;
  update(delta = 0) {
    this.animationState.update(delta);
    this.animationState.apply(this.skeleton);
    this.skeleton.update(delta);
    this.preWorldTransform?.();
    this.skeleton.updateWorldTransform(Physics.update);
    this.detectAllAttachmentUpdates();

    const [vertexCount, indexCount] = this.computeVertexAndIndexCounts();
    const backingArraysChanged =
      vertexCount !== this.currentVertexCount ||
      indexCount !== this.currentIndexCount;
    this.currentVertexCount = vertexCount;
    this.currentIndexCount = indexCount;

    let indexArr: Uint16Array;
    let posArr: Float32Array;
    let uvArr: Float32Array;
    let colorArr: Float32Array;
    let opacityArr: Float32Array;
    let fadeArr: Float32Array;
    let outlineArr: Float32Array;

    if (backingArraysChanged) {
      indexArr = new Uint16Array(indexCount);
      posArr = new Float32Array(vertexCount * 3);
      uvArr = new Float32Array(vertexCount * 2);
      colorArr = new Float32Array(vertexCount * 3);
      opacityArr = new Float32Array(vertexCount);
      opacityArr.fill(1);
      fadeArr = new Float32Array(vertexCount * 4);
      outlineArr = new Float32Array(vertexCount * 4);
      this.indexArr = indexArr;
      this.posArr = posArr;
      this.uvArr = uvArr;
      this.colorArr = colorArr;
      this.opacityArr = opacityArr;
      this.fadeArr = fadeArr;
      this.outlineArr = outlineArr;
    } else {
      indexArr = this.indexArr;
      posArr = this.posArr;
      uvArr = this.uvArr;
      colorArr = this.colorArr;
      opacityArr = this.opacityArr;
      fadeArr = this.fadeArr;
      outlineArr = this.outlineArr;
    }

    this.updateArrays(
      indexArr,
      posArr,
      uvArr,
      colorArr,
      opacityArr,
      fadeArr,
      outlineArr
    );

    if (backingArraysChanged) {
      this.indexArr = indexArr;
      this.posArr = posArr;
      this.uvArr = uvArr;
      this.geometry.setIndex(new BufferAttribute(indexArr, 1));
      this.geometry.setAttribute("position", new BufferAttribute(posArr, 3));
      this.geometry.setAttribute("uv", new BufferAttribute(uvArr, 2));
      this.geometry.setAttribute("vtxColor", new BufferAttribute(colorArr, 3));
      this.geometry.setAttribute(
        "vtxOpacity",
        new BufferAttribute(opacityArr, 1)
      );
      this.geometry.setAttribute("vtxFade", new BufferAttribute(fadeArr, 4));
      this.geometry.setAttribute(
        "vtxOutline",
        new BufferAttribute(outlineArr, 4)
      );
    } else {
      const index = this.geometry.getIndex();
      if (index) index.needsUpdate = true;
      this.geometry.getAttribute("position").needsUpdate = true;
      this.geometry.getAttribute("uv").needsUpdate = true;
      this.geometry.getAttribute("vtxColor").needsUpdate = true;
      this.geometry.getAttribute("vtxOpacity").needsUpdate = true;
      this.geometry.getAttribute("vtxFade").needsUpdate = true;
      this.geometry.getAttribute("vtxOutline").needsUpdate = true;
    }

    this.geometry.computeBoundingBox();
  }
  private updateArrays(
    indexArr: Uint16Array,
    posArr: Float32Array,
    uvArr: Float32Array,
    colorArr: Float32Array,
    opacityArr: Float32Array,
    fadeArr: Float32Array,
    outlineArr: Float32Array
  ) {
    // Set defaults.
    opacityArr.fill(1);
    colorArr.fill(1);
    fadeArr.fill(0);
    outlineArr.fill(0);

    // Do updates.
    const outlineSpread = this.outlineSpread;
    const invTextureSizeX = this.invTextureSize.x;
    const invTextureSizeY = this.invTextureSize.y;
    const tmpColor = new Color();
    let indexOffset = 0;
    let indexWriteOffset = 0;
    let posOffset = 0;
    let uvOffset = 0;
    let colorOffset = 0;
    let opacityOffset = 0;
    let fadeOffset = 0;
    let outlineOffset = 0;
    let z = 0;
    for (let si = 0; si < this.skeleton.drawOrder.length; si++) {
      const slot = this.skeleton.drawOrder[si];
      const attachment = slot.getAttachment();
      if (!attachment) continue;
      if (attachment instanceof RegionAttachment) {
        const region = attachment as RegionAttachment;
        // Write indices.
        for (let ii = 0; ii < 6; ii++)
          indexArr[indexOffset + ii] = indexWriteOffset + kQuadTriangles[ii];
        indexWriteOffset += 4;
        indexOffset += 6;
        // Write vertices.
        region.computeWorldVertices(slot, posArr, posOffset, 3);
        // Write vertex Z offsets.
        posArr[posOffset + 2] = z;
        posArr[posOffset + 5] = z;
        posArr[posOffset + 8] = z;
        posArr[posOffset + 11] = z;
        posOffset += 12;
        z += 0.1;
        // Calculate UV with outline padding.
        let uvCenterX = 0;
        let uvCenterY = 0;
        for (let uvi = 0; uvi < 4; uvi++) {
          uvCenterX += region.uvs[uvi * 2 + 0];
          uvCenterY += region.uvs[uvi * 2 + 1];
        }
        uvCenterX *= 0.25;
        uvCenterY *= 0.25;
        // Write UVs.
        for (let uvi = 0; uvi < 4; uvi++) {
          let uvX = region.uvs[uvi * 2 + 0];
          let uvY = region.uvs[uvi * 2 + 1];
          uvX +=
            uvX > uvCenterX
              ? invTextureSizeX * outlineSpread
              : -invTextureSizeX * outlineSpread;
          uvY +=
            uvY > uvCenterY
              ? invTextureSizeY * outlineSpread
              : -invTextureSizeY * outlineSpread;
          uvArr[uvOffset + uvi * 2 + 0] = uvX;
          uvArr[uvOffset + uvi * 2 + 1] = uvY;
        }
        uvOffset += 8;

        // Write special shader overrides.
        const overrides = this.slotShaderOverrides.get(slot.data.name);
        if (overrides !== undefined) {
          const opacity = overrides.opacity ?? 1;
          opacityArr.fill(opacity, opacityOffset, opacityOffset + 4);
          tmpColor.set(overrides.color ?? 0xffffff);
          tmpColor.toArray(colorArr, colorOffset + 0);
          tmpColor.toArray(colorArr, colorOffset + 3);
          tmpColor.toArray(colorArr, colorOffset + 6);
          tmpColor.toArray(colorArr, colorOffset + 9);
          tmpColor.set(overrides.fadeColor ?? 0xffffff);
          const fadeAmount = overrides.fadeAmount ?? 0;
          tmpColor.toArray(fadeArr, fadeOffset + 0);
          tmpColor.toArray(fadeArr, fadeOffset + 4);
          tmpColor.toArray(fadeArr, fadeOffset + 8);
          tmpColor.toArray(fadeArr, fadeOffset + 12);
          fadeArr[fadeOffset + 3] = fadeAmount;
          fadeArr[fadeOffset + 7] = fadeAmount;
          fadeArr[fadeOffset + 11] = fadeAmount;
          fadeArr[fadeOffset + 15] = fadeAmount;
          const outlineAmount = overrides.outlineAmount ?? 0;
          tmpColor.set(overrides.outlineColor ?? 0x000000);
          tmpColor.toArray(outlineArr, outlineOffset + 0);
          tmpColor.toArray(outlineArr, outlineOffset + 4);
          tmpColor.toArray(outlineArr, outlineOffset + 8);
          tmpColor.toArray(outlineArr, outlineOffset + 12);
          outlineArr[outlineOffset + 3] = outlineAmount;
          outlineArr[outlineOffset + 7] = outlineAmount;
          outlineArr[outlineOffset + 11] = outlineAmount;
          outlineArr[outlineOffset + 15] = outlineAmount;
        }

        colorOffset += 12;
        opacityOffset += 4;
        fadeOffset += 16;
        outlineOffset += 16;
        continue;
      }
      if (attachment instanceof MeshAttachment) {
        const mesh = attachment as MeshAttachment;
        const meshVertexCount = Math.floor(mesh.vertices.length / 2);
        for (let ii = 0; ii < mesh.triangles.length; ii++)
          indexArr[indexOffset + ii] = indexWriteOffset + mesh.triangles[ii];
        indexOffset += mesh.triangles.length;
        indexWriteOffset += meshVertexCount;
        mesh.computeWorldVertices(
          slot,
          0,
          meshVertexCount,
          posArr,
          posOffset,
          3
        );
        for (let vi = 0; vi < meshVertexCount; vi++) {
          posArr[posOffset + vi * 3 + 2] = z;
          uvArr[uvOffset + vi * 2 + 0] = mesh.uvs[vi * 2 + 0];
          uvArr[uvOffset + vi * 2 + 1] = mesh.uvs[vi * 2 + 1];
        }
        posOffset += meshVertexCount * 3;
        uvOffset += meshVertexCount * 2;
        z += 0.1;
        // Write special shader overrides.
        // const overrides = this.slotShaderOverrides.get(slot.data.name);
        // TODO: use overrides.
        colorOffset += meshVertexCount * 3;
        opacityOffset += meshVertexCount;
        fadeOffset += meshVertexCount * 4;
        outlineOffset += meshVertexCount * 4;
        continue;
      }
    }
  }
  setSlotAttachment(slotName: string, attachmentName: string) {
    const skeleton = this.skeleton;
    const slot = skeleton.findSlot(slotName);
    const attachment = skeleton.getAttachmentByName(slotName, attachmentName);
    if (slot && attachment) {
      slot.setAttachment(attachment);
    }
  }
  clearSlotAttachment(slotName: string) {
    const skeleton = this.skeleton;
    const slot = skeleton.findSlot(slotName);
    slot?.setAttachment(null);
  }
  getAABBForBone(boneName: string, slotNameIn?: string, aabbIn?: AABB) {
    const slotName = slotNameIn ?? boneName;
    const aabb = aabbIn ?? new AABB();
    const bone = this.skeleton.findBone(boneName);
    const localOffset = new Vector2();
    const attachment = this.skeleton.findSlot(slotName)?.getAttachment();
    if (attachment) {
      if (attachment instanceof RegionAttachment) {
        aabb.size.x = attachment.width;
        aabb.size.y = attachment.height;
        localOffset.x = attachment.x;
        localOffset.y = attachment.y;
        this.regionOverrider?.(attachment.name, localOffset, aabb.size);
      }
    }
    if (bone) {
      const rawBonePos = bone.localToWorld(localOffset);
      aabb.position.x = rawBonePos.x * this.mesh.scale.x;
      aabb.position.y = rawBonePos.y * this.mesh.scale.x;
      const rawBoneRot = bone.localToWorldRotation(0) + bone.rotation;
      aabb.rotation = (rawBoneRot * Math.PI) / 180;
    }
    return aabb;
  }
  private detectAllAttachmentUpdates() {
    for (const slot of this.skeleton.drawOrder) {
      const attachment = slot.attachment;
      const prevAttachmentName = this.slotAttachments.get(slot.data.name);
      if (attachment?.name !== prevAttachmentName) {
        if (prevAttachmentName) {
          this.events.emit(ThreeSpineEvents.RemoveAttachment, {
            slotName: slot.data.name,
            attachmentName: prevAttachmentName
          });
        }
        if (attachment) {
          this.events.emit(ThreeSpineEvents.AddAttachment, {
            slotName: slot.data.name,
            attachmentName: attachment.name
          });
          this.slotAttachments.set(slot.data.name, attachment.name);
        } else {
          this.slotAttachments.delete(slot.data.name);
        }
      }
    }
  }
  setSlotShaderOverride(
    slotName: string,
    shaderOverride: ThreeSpineShaderOverride | null
  ) {
    if (shaderOverride) {
      this.slotShaderOverrides.set(slotName, shaderOverride);
    } else {
      this.slotShaderOverrides.delete(slotName);
    }
  }
  getSlotShaderOverride(slotName: string) {
    return this.slotShaderOverrides.get(slotName) ?? null;
  }
  setRegionOverrider(regionOverrider: ThreeSpineRegionOverrider | null) {
    this.regionOverrider = regionOverrider ?? undefined;
  }
  setColor(color: number | string | Color) {
    this.material.uniforms.color.value.set(color);
    this.material.uniformsNeedUpdate = true;
  }
  setFade(fadeAmount: number, fadeColor?: number | string | Color) {
    const fadeAsColor = new Color(fadeColor);
    this.material.uniforms.fade.value.x = fadeAsColor.r;
    this.material.uniforms.fade.value.y = fadeAsColor.g;
    this.material.uniforms.fade.value.z = fadeAsColor.b;
    this.material.uniforms.fade.value.w = fadeAmount;
    this.material.uniformsNeedUpdate = true;
  }
}

export class AABB {
  public position = new Vector2();
  public rotation = 0;
  public size = new Vector2();
}
