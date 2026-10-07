import { Color, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { Signal, SignalBusAPI, SignalConnectionEvents } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

const IDLE_FRAME_COLOR = 0x2a4858;
const IDLE_BODY_COLOR = 0x0c1620;
const ACTIVE_COLOR = 0x9ce3ff;
const FLASH_MS = 300;

/**
 * A 1x1 junction that ties multiple wires together. When a signal arrives on
 * any of its connected buses, the junction relays it onto every other linked
 * bus — effectively bridging wires that share the junction. Loop prevention is
 * handled centrally by the signal network's relay dedupe, so cycles through
 * the network self-terminate.
 */
export class SignalJunction extends CoreEntity {
  static type = "SignalJunction";
  public type = SignalJunction.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors = {
    signal: new SignalConnectionBehavior()
  };

  private frame: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private body: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private idleFrameColor = new Color(IDLE_FRAME_COLOR);
  private idleBodyColor = new Color(IDLE_BODY_COLOR);
  private activeColor = new Color(ACTIVE_COLOR);
  private flashRemaining = 0;

  constructor(props: EntityProps) {
    super(props);
    if (!this.size.width || !this.size.height) {
      this.size = { width: 1, height: 1 };
    }
    const w = this.size.width;
    const h = this.size.height;

    this.frame = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({
        color: this.idleFrameColor.clone(),
        transparent: true,
        opacity: 0.9
      })
    );
    this.body = new Mesh(
      new PlaneGeometry(w * 0.72, h * 0.72),
      new MeshBasicMaterial({
        color: this.idleBodyColor.clone(),
        transparent: true,
        opacity: 0.95
      })
    );
    this.body.position.z = 0.001;
    this.object3D.add(this.frame, this.body);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.signal.init(this);
    // A 1x1 box should reach wires that touch its edges (~0.5 from center),
    // not pull in everything within the default 1.0 unit radius.
    this.behaviors.signal.setSnapDistance(Math.max(w, h) * 0.6);

    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal, fromBus }) => this.proxy(signal, fromBus)
    );
  }

  private proxy(signal: Signal, fromBus?: SignalBusAPI) {
    if (!this.level || !fromBus) return;
    const relayed = this.level.signalNetwork.relay(
      signal,
      fromBus,
      this.behaviors.signal.links.keys(),
      this.behaviors.signal
    );
    if (relayed) this.flashRemaining = FLASH_MS;
  }

  step(ms: number) {
    super.step(ms);
    if (this.flashRemaining > 0) {
      this.flashRemaining = Math.max(0, this.flashRemaining - ms);
      const t = this.flashRemaining / FLASH_MS;
      this.frame.material.color
        .copy(this.idleFrameColor)
        .lerp(this.activeColor, t);
      this.body.material.color
        .copy(this.idleBodyColor)
        .lerp(this.activeColor, t * 0.5);
    }
  }

  destroy() {
    super.destroy();
    this.frame.geometry.dispose();
    this.frame.material.dispose();
    this.body.geometry.dispose();
    this.body.material.dispose();
  }
}
