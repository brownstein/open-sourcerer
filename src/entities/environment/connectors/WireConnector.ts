import getNormals from "polyline-normals";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  Vector2
} from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addFlag,
  getAsset,
  setAssetDependencies
} from "src/engine/entity/decorators";
import { vector2To3, vector2ToArr2 } from "src/engine/util/vecTypes";
import { SignalBusBehavior } from "src/entities/shared/behaviors/SignalBusBehavior";

import fragmentShader from "./shaders/wireConnector.frag.glsl";
import vertexShader from "./shaders/wireConnector.vert.glsl";

export type WireConnectorProps = EntityProps & {
  vine?: boolean;
  /** World units/second a signal travels along the wire. Omit for instant. */
  propagationSpeed?: number;
};

const VINE_ASPECT_RATIO = 1;
const WIRE_ASPECT_RATIO = 4;

/** Fixed width (world units along the wire) of each travelling signal pulse. */
const PULSE_WIDTH = 0.5;

/** How long the wire's highlight lingers after a pulse reaches the wire ends. */
const PULSE_FADE_MS = 250;

/**
 * Time an instant delivery's band takes to cross its wire, whatever the
 * length. Deriving the sweep speed from this keeps short and long wires
 * equally instant instead of a fixed speed crawling across long ones.
 */
const INSTANT_SWEEP_DURATION_MS = 50;

/**
 * Whole-wire glow floor for an instant delivery, as a fraction of the pulse
 * intensity, flashing the whole length at once. The travelling sprite still
 * rides the front on top of it to show direction.
 */
const INSTANT_FLASH_FACTOR = 1.5;

/** Cap on pulses rendered at once per wire (glow bands + sprite pairs). */
// Must match MAX_PULSES in wireConnector.frag.glsl
const MAX_VISUAL_PULSES = 32;

/**
 * A highlight pulse racing outward along the wire from its tap point. Many can
 * be in flight at once; each advances `radius` at its own `speed` and fades
 * once it has passed both wire ends.
 */
type VisualPulse = {
  originDistance: number;
  radius: number;
  speed: number;
  instant: boolean;
  fading: boolean;
  fadeRemaining: number;
};

@addFlag("requireShape")
@setAssetDependencies(() => ["vineThin", "wires1", "signal"])
export class WireConnector extends CoreEntity {
  static type = "WireConnector";
  public type = WireConnector.type;

  public object3D = new Object3D();

  public behaviors = {
    signalBus: new SignalBusBehavior()
  };

  private texture: Texture;

  private geom = new BufferGeometry();

  private indexArr?: Uint16Array;
  private posArr?: Float32Array;
  private uvArr?: Float32Array;
  private miterThicknessArr?: Float32Array;
  private distArr?: Float32Array;

  private material: ShaderMaterial;
  private mesh: Mesh;

  private totalLength = 0;
  private pulses: VisualPulse[] = [];
  private isVine = false;

  private pulseSprites: ReturnType<WireConnector["makeSignalSprite"]>[] = [];

  constructor(props: WireConnectorProps) {
    super(props);

    this.isVine = !!props.vine;
    this.texture = props.vine
      ? getAsset("vineThin").clone()
      : getAsset("wires1").clone();

    this.material = new ShaderMaterial({
      fragmentShader,
      vertexShader,
      uniforms: {
        map: {
          value: this.texture
        },
        color: {
          value: new Color(1, 1, 1)
        },
        opacity: {
          value: 1
        },
        thickness: {
          value: 0.25
        },
        highlightPulses: {
          value: Array.from({ length: MAX_VISUAL_PULSES }, () => new Vector2())
        },
        highlightIntensities: {
          value: new Float32Array(MAX_VISUAL_PULSES)
        },
        highlightCount: {
          value: 0
        },
        highlightWidth: {
          value: PULSE_WIDTH
        },
        highlightBase: {
          value: 0
        }
      },
      transparent: true,
      alphaTest: 0.1,
      depthTest: true
    });
    this.mesh = new Mesh(this.geom, this.material);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.object3D.add(this.mesh);
    this.texture.wrapS = RepeatWrapping;
    this.texture.wrapT = RepeatWrapping;

    if (props.polygon) this.makeGeometry(props.polygon, true);
    if (props.polyline) this.makeGeometry(props.polyline);

    this.behaviors.signalBus.init(this);
    this.behaviors.signalBus.setPropagationSpeed(props.propagationSpeed);
    const wirePath = props.polygon ?? props.polyline;
    if (wirePath) {
      this.behaviors.signalBus.setPolyline(wirePath, !!props.polygon);
    }
    this.behaviors.signalBus.bus.events.on(
      "transmitted",
      ({ originDistance }) => {
        const speed = this.behaviors.signalBus.bus.propagationSpeed;
        const timedSpeed =
          speed && speed > 0 && speed !== Infinity ? speed : undefined;
        const maxReach = Math.max(
          originDistance,
          this.totalLength - originDistance
        );
        this.pulses.push({
          originDistance,
          radius: 0,
          speed:
            timedSpeed ??
            Math.max(maxReach, 0.001) / (INSTANT_SWEEP_DURATION_MS / 1000),
          instant: timedSpeed === undefined,
          fading: false,
          fadeRemaining: PULSE_FADE_MS
        });
        if (this.pulses.length > MAX_VISUAL_PULSES) this.pulses.shift();
      }
    );
  }
  destroy(): void {
    super.destroy();
    this.texture.dispose();
    this.geom.dispose();
    this.material.dispose();
    for (const sprite of this.pulseSprites) sprite.dispose();
  }
  private makeGeometry(vertices: Vector2[], closed = false) {
    if (vertices.length < 2) return;
    const pathArr2 = vertices.map(vector2ToArr2);
    const normalsAndMiters = getNormals(pathArr2, closed);

    const uvDistanceCoeff = this.isVine ? VINE_ASPECT_RATIO : WIRE_ASPECT_RATIO;

    const vertexCount = closed ? vertices.length + 1 : vertices.length;
    this.indexArr = new Uint16Array((vertexCount - 1) * 6);
    this.posArr = new Float32Array(vertexCount * 6);
    this.uvArr = new Float32Array(vertexCount * 4);
    this.miterThicknessArr = new Float32Array(vertexCount * 6);
    this.distArr = new Float32Array(vertexCount * 2);
    const { geom, indexArr, posArr, uvArr, miterThicknessArr, distArr } = this;
    this.geom.setAttribute("position", new BufferAttribute(posArr, 3));
    this.geom.setAttribute("uv", new BufferAttribute(uvArr, 2));
    this.geom.setAttribute("vtxDistance", new BufferAttribute(distArr, 1));
    this.geom.setAttribute(
      "vtxNormalMiter",
      new BufferAttribute(miterThicknessArr, 3)
    );
    this.geom.setIndex(new BufferAttribute(indexArr, 1));
    for (let vi = 0; vi < vertexCount - 1; vi++) {
      const vvi = vi * 2;
      const ivi = vi * 6;
      indexArr[ivi + 0] = vvi;
      indexArr[ivi + 1] = vvi + 2;
      indexArr[ivi + 2] = vvi + 1;
      indexArr[ivi + 3] = vvi + 1;
      indexArr[ivi + 4] = vvi + 2;
      indexArr[ivi + 5] = vvi + 3;
    }
    let totalDist = 0;
    let prev = vertices.at(0);
    if (prev === undefined) return;
    const delta = new Vector2();
    for (let vi = 0; vi < vertices.length; vi++) {
      const vvi = vi * 6;
      const uvi = vi * 4;
      const di = vi * 2;
      const next = vertices.at(vi);
      const nextNormalMiter = normalsAndMiters.at(vi);
      if (next === undefined || nextNormalMiter === undefined) continue;
      const [nextNormal, nextMiter] = nextNormalMiter;
      delta.copy(next).sub(prev);
      totalDist += delta.length();
      next.toArray(posArr, vvi + 0);
      next.toArray(posArr, vvi + 3);
      uvArr[uvi + 0] = 0;
      uvArr[uvi + 1] = totalDist * uvDistanceCoeff;
      uvArr[uvi + 2] = 1;
      uvArr[uvi + 3] = totalDist * uvDistanceCoeff;
      distArr[di + 0] = totalDist;
      distArr[di + 1] = totalDist;
      miterThicknessArr[vvi + 0] = nextNormal[0];
      miterThicknessArr[vvi + 1] = nextNormal[1];
      miterThicknessArr[vvi + 2] = -nextMiter;
      miterThicknessArr[vvi + 3] = nextNormal[0];
      miterThicknessArr[vvi + 4] = nextNormal[1];
      miterThicknessArr[vvi + 5] = nextMiter;
      prev = next;
    }
    if (closed) {
      const vi = vertices.length;
      const vvi = vi * 6;
      const uvi = vi * 4;
      const di = vi * 2;
      const next = vertices.at(0);
      const nextNormalMiter = normalsAndMiters.at(0);
      if (next === undefined || nextNormalMiter === undefined) return;
      const [nextNormal, nextMiter] = nextNormalMiter;
      delta.copy(next).sub(prev);
      totalDist += delta.length();
      next.toArray(posArr, vvi + 0);
      next.toArray(posArr, vvi + 3);
      uvArr[uvi + 0] = 0;
      uvArr[uvi + 1] = totalDist * uvDistanceCoeff;
      uvArr[uvi + 2] = 1;
      uvArr[uvi + 3] = totalDist * uvDistanceCoeff;
      distArr[di + 0] = totalDist;
      distArr[di + 1] = totalDist;
      miterThicknessArr[vvi + 0] = nextNormal[0];
      miterThicknessArr[vvi + 1] = nextNormal[1];
      miterThicknessArr[vvi + 2] = -nextMiter;
      miterThicknessArr[vvi + 3] = nextNormal[0];
      miterThicknessArr[vvi + 4] = nextNormal[1];
      miterThicknessArr[vvi + 5] = nextMiter;
    }
    geom.computeBoundingSphere();
    this.totalLength = totalDist;
  }
  step(ms: number) {
    super.step(ms);
    this.advancePulses(ms);
    this.updateHighlight();
    this.material.uniformsNeedUpdate = true;
  }

  private advancePulses(ms: number) {
    for (const pulse of this.pulses) {
      if (pulse.fading) {
        pulse.fadeRemaining -= ms;
        continue;
      }
      pulse.radius += pulse.speed * (ms / 1000);
      const maxReach = Math.max(
        pulse.originDistance,
        this.totalLength - pulse.originDistance
      );
      if (pulse.radius >= maxReach) pulse.fading = true;
    }
    this.pulses = this.pulses.filter(
      (pulse) => !pulse.fading || pulse.fadeRemaining > 0
    );
  }

  private updateHighlight() {
    const uniforms = this.material.uniforms;
    const pulses = this.pulses.slice(-MAX_VISUAL_PULSES);
    this.ensurePulseSprites(pulses.length);
    let base = 0;
    for (let i = 0; i < MAX_VISUAL_PULSES; i++) {
      const pulse = pulses[i];
      const forward = this.pulseSprites[i * 2];
      const backward = this.pulseSprites[i * 2 + 1];
      if (!pulse) {
        uniforms.highlightIntensities.value[i] = 0;
        if (forward) forward.mesh.visible = false;
        if (backward) backward.mesh.visible = false;
        continue;
      }
      const intensity = pulse.fading ? pulse.fadeRemaining / PULSE_FADE_MS : 1;
      const left = pulse.originDistance - pulse.radius;
      const right = pulse.originDistance + pulse.radius;
      // Two fronts race outward from the tap point; each passes a connection
      // exactly as the bus delivers to it.
      uniforms.highlightPulses.value[i].set(left, right);
      uniforms.highlightIntensities.value[i] = intensity;
      if (pulse.instant) {
        base = Math.max(base, intensity * INSTANT_FLASH_FACTOR);
      }
      this.placeSprite(forward, right, right < this.totalLength, intensity);
      this.placeSprite(backward, left, left > 0, intensity);
    }
    uniforms.highlightCount.value = pulses.length;
    uniforms.highlightBase.value = base;
  }

  private placeSprite(
    sprite: ReturnType<WireConnector["makeSignalSprite"]> | undefined,
    distanceAlong: number,
    visible: boolean,
    intensity: number
  ) {
    if (!sprite) return;
    sprite.mesh.visible = visible;
    if (!visible) return;
    const bus = this.behaviors.signalBus.bus;
    const point = bus.getPointAlongLine(distanceAlong);
    sprite.mesh.position.copy(vector2To3(point)).sub(this.position).setZ(-0.05);
    const ahead = bus.getPointAlongLine(distanceAlong + 0.01);
    const delta = ahead.sub(point);
    if (delta.lengthSq() > 0) sprite.mesh.rotation.z = delta.angle();
    sprite.setOpacity(intensity);
  }

  private ensurePulseSprites(pulseCount: number) {
    const needed = Math.min(pulseCount, MAX_VISUAL_PULSES) * 2;
    while (this.pulseSprites.length < needed) {
      this.pulseSprites.push(this.makeSignalSprite());
    }
  }

  private makeSignalSprite() {
    const sprite = getAsset("signal").getSprite();
    sprite.center();
    sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, 2);
    sprite.mesh.visible = false;
    this.object3D.add(sprite.mesh);
    return sprite;
  }
}
