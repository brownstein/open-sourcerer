import {
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry
} from "three";

import { EntityAlignment, EntityHitDetails, EntityProps } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  AreaHitSwitchBehavior,
  AreaHitSwitchEvents
} from "src/entities/shared/behaviors/AreaHitSwitchBehavior";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

const IDLE_COLOR = 0x1b3a4b;
const SEND_COLOR = 0xffd24a;
const RECEIVE_COLOR = 0x4ad6ff;
const BLINK_DURATION_MS = 350;

/**
 * A signal terminal that taps onto a nearby wire. When hit it blinks and pushes
 * a pulse onto the wire; when the wire delivers a pulse from another terminal it
 * blinks in a different color. Pair with {@link WireConnector} entities to build
 * hittable signal circuits.
 */
export class HitSignal extends CoreEntity {
  static type = "HitSignal";
  public type = HitSignal.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors = {
    areaSwitch: new AreaHitSwitchBehavior({ timeOut: 200 }),
    signal: new SignalConnectionBehavior()
  };

  private core: Mesh<CircleGeometry, MeshBasicMaterial>;
  private ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private idleColor = new Color(IDLE_COLOR);
  private blinkColor = new Color(SEND_COLOR);
  private blinkRemaining = 0;

  constructor(props: EntityProps) {
    super(props);

    if (!this.size.width || !this.size.height) {
      this.size = { width: 0.5, height: 0.5 };
    }
    const radius = Math.min(this.size.width, this.size.height) * 0.5;

    this.core = new Mesh(
      new CircleGeometry(radius, 24),
      new MeshBasicMaterial({
        color: this.idleColor.clone(),
        transparent: true
      })
    );
    this.ring = new Mesh(
      new RingGeometry(radius * 1.1, radius * 1.35, 24),
      new MeshBasicMaterial({
        color: this.idleColor.clone(),
        transparent: true,
        opacity: 0.85
      })
    );
    this.object3D.add(this.ring, this.core);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.areaSwitch.init(this);
    this.behaviors.signal.init(this);

    this.behaviors.areaSwitch.events.on(AreaHitSwitchEvents.SwitchOn, () => {
      this.blink(SEND_COLOR);
      this.behaviors.signal.transmit({ value: true, name: "pulse" });
    });
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      () => {
        this.blink(RECEIVE_COLOR);
      }
    );
  }

  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    this.behaviors.areaSwitch.onHit(hitDetails);
  }

  blink(color: number) {
    this.blinkColor.set(color);
    this.blinkRemaining = BLINK_DURATION_MS;
  }

  step(ms: number) {
    super.step(ms);
    if (this.blinkRemaining > 0) {
      this.blinkRemaining = Math.max(0, this.blinkRemaining - ms);
      const t = this.blinkRemaining / BLINK_DURATION_MS;
      this.core.material.color.copy(this.idleColor).lerp(this.blinkColor, t);
      this.ring.material.color.copy(this.idleColor).lerp(this.blinkColor, t);
      const scale = 1 + 0.6 * t;
      this.core.scale.setScalar(scale);
      this.ring.scale.setScalar(scale);
    }
  }

  destroy() {
    super.destroy();
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
