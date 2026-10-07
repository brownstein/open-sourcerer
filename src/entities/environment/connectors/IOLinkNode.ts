import { Object3D } from "three";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps,
  TiledObjectRef
} from "src/api/entity";
import { SignalConnectionEvents, SignalData } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { SignalBus } from "src/engine/signal/SignalBus";
import {
  SignalConnectionBehavior,
  SignalConnectionParticipant
} from "src/entities/shared/behaviors/SignalConnectionBehavior";
import { SignalProcessorBehavior } from "src/entities/shared/behaviors/SignalProcessorBehavior";

import { TextPixelated } from "../TextPixelated";

/** Port names the processor assigns to a lone unnamed terminal. */
const AUTO_INPUT_NAME = "input";
const AUTO_OUTPUT_NAME = "output";

const ERROR_COLOR = "#ff6666";
const UNSET_COLOR = "#888888";

type LinkStatus = "unset" | "missing" | "notLinkable" | "linked";

export type IOLinkNodeProps = EntityProps & {
  /** Tiled object id of the entity to proxy into the node graph. */
  target?: TiledObjectRef;
};

/**
 * Built-in proxy: stands in for another entity anywhere in the level. Values
 * fed to this node's inputs are transmitted to the target as if a wire ran to
 * it, and everything the target transmits comes back out of this node's
 * outputs. Wires a distant camera zone, door, or trigger into a node nest
 * without running wire across the map, and gives entities that only speak
 * unnamed signals a set of named ports.
 */
@setAssetDependencies(() => ["ioNode"])
@setConsumerDependencies(() => [TextPixelated])
export class IOLinkNode extends CoreEntity {
  static type = "IOLinkNode";
  public type = IOLinkNode.type;

  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public behaviors: {
    signal: SignalConnectionBehavior;
    processor: SignalProcessorBehavior;
  };

  private readonly target?: TiledObjectRef;
  private targetBus?: SignalBus;
  private targetTypeName?: string;
  private status: LinkStatus;
  private readonly fromTarget = new Map<string, SignalData>();

  constructor(props: IOLinkNodeProps) {
    super(props);

    this.target = props.target;
    this.status = this.target === undefined ? "unset" : "missing";

    if (!this.size.width || !this.size.height) {
      this.size = { width: 1, height: 1 };
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors = {
      signal: new SignalConnectionBehavior({ autoProximity: false }),
      processor: new SignalProcessorBehavior({
        requireAllInputs: false,
        frameColor: "#38bdf8",
        displayText: () => this.describeLink(),
        // Routing is per-bus rather than through the returned output map: the
        // processor broadcasts that map on every bus, which would echo the
        // node's own emissions straight back to the linked entity.
        process: (inputs) => {
          this.forwardToTarget(inputs);
          this.forwardFromTarget();
          return new Map<string, SignalData>();
        }
      })
    };
    this.behaviors.signal.init(this);
    this.behaviors.processor.init(this);

    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal, fromBus }) => {
        if (!this.targetBus || fromBus !== this.targetBus) return;
        this.fromTarget.set(signal.name ?? AUTO_OUTPUT_NAME, signal.value);
        this.behaviors.processor.queueProcessing();
      }
    );
  }

  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    if (level.fullyPreLoaded) {
      this.resolveTarget();
    } else {
      level.on(EntityLevelEvents.PreloadComplete, this.resolveTarget);
    }
  }

  detachFromLevel(level: EntityLevelAPI) {
    super.detachFromLevel(level);
    level.off(EntityLevelEvents.PreloadComplete, this.resolveTarget);
    this.targetBus = undefined;
    this.fromTarget.clear();
  }

  private readonly resolveTarget = () => {
    if (this.target === undefined || !this.level) return;
    const targetEntity = this.level.getEntity<SignalConnectionParticipant>(
      `tle-${this.target}`
    );
    if (!targetEntity) {
      this.status = "missing";
    } else if (!targetEntity.behaviors.signal) {
      this.status = "notLinkable";
    } else {
      this.targetBus = this.behaviors.signal.linkTo(targetEntity);
      this.targetTypeName = targetEntity.type;
      this.status = this.targetBus ? "linked" : "notLinkable";
    }
    this.behaviors.processor.queueProcessing();
  };

  private forwardToTarget(inputs: Map<string, SignalData>) {
    if (!this.targetBus) return;
    for (const [name, value] of inputs) {
      if (value === null || value === undefined) continue;
      this.targetBus.transmit(
        {
          value,
          // Most world entities read unnamed signals, so the lone auto-named
          // input speaks to them unnamed; explicit port names carry through.
          name: name === AUTO_INPUT_NAME ? undefined : name,
          sourceId: this.id
        },
        this.behaviors.signal
      );
      this.behaviors.processor.consumeInput(name);
    }
  }

  private forwardFromTarget() {
    if (this.fromTarget.size === 0) return;
    for (const [name, value] of this.fromTarget) {
      for (const bus of this.behaviors.signal.links.keys()) {
        if (bus === this.targetBus) continue;
        bus.transmit({ value, name, sourceId: this.id }, this.behaviors.signal);
      }
    }
    this.fromTarget.clear();
  }

  private describeLink() {
    switch (this.status) {
      case "linked":
        return { lines: [`> ${this.targetTypeName}`] };
      case "missing":
        return { lines: [`#${this.target} missing`], color: ERROR_COLOR };
      case "notLinkable":
        return { lines: ["not linkable"], color: ERROR_COLOR };
      default:
        return { lines: ["link"], color: UNSET_COLOR };
    }
  }
}
