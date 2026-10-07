import { ProtoSpriteThree } from "protosprite-three";
import { Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityLifecycleEvents
} from "src/api/entity";
import {
  SignalConnectionEvents,
  SignalReceivedPayload,
  validateSignalData
} from "src/api/signal";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { getAsset } from "src/engine/entity/decorators";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { SignalBus } from "src/engine/signal/SignalBus";
import { SignalNetwork } from "src/engine/signal/SignalNetwork";
import { vector2To3 } from "src/engine/util/vecTypes";
import * as ioNodeTypes from "src/entities/environment/sprites/connectable/ionode";
import { distance3DTo2D } from "src/util/mathUtils";

import { SignalConnectionBehavior } from "./SignalConnectionBehavior";
import {
  AttachmentSlotInfo,
  DirectionalConfig,
  SignalInputMeta,
  SignalProcessorBehavior,
  directionConfigs,
  findSignalProcessorBehavior
} from "./SignalProcessorBehavior";

/** Radius (world units) in which a terminal searches for a processor node. */
const IO_NODE_SNAP_DISTANCE = 1.5;

/** Forward depth offset so a docked terminal renders in front of its own layer. */
const TERMINAL_DEPTH_BIAS = 0.05;

export type TerminalRole = "input" | "output";

export type TerminalCompatibleEntity = BaseEntityType<{
  signal?: SignalConnectionBehavior;
}>;

/**
 * The terminal side of a processor-node assembly. Composed alongside a
 * {@link SignalConnectionBehavior} on terminal entities, it binds to the
 * nearest entity carrying a {@link SignalProcessorBehavior} on level preload:
 * docks to the node's attachment slot, orients its arrow sprite, registers
 * its port metadata, and relays values between the tapped wire and the node
 * over a logical bus — remapping incoming signals to the registered port name.
 */
export class TerminalBehavior
  implements EntityBehavior<TerminalCompatibleEntity>
{
  static type = "Terminal";
  public type = TerminalBehavior.type;
  public readonly events = createTypedEventEmitter<{
    relabeled: string;
  }>();

  public readonly role: TerminalRole;
  public node?: SignalProcessorBehavior;
  private scheduler = new Scheduler();

  private meta: SignalInputMeta;
  private entity?: TerminalCompatibleEntity;
  private connection?: SignalConnectionBehavior;
  private level?: EntityLevelAPI;
  private network?: SignalNetwork;
  private nodeBus?: SignalBus;
  private sprite?: ProtoSpriteThree<
    ioNodeTypes.sprite_layers,
    ioNodeTypes.sprite_animations
  >;
  private arrowLayerName?: ioNodeTypes.sprite_layers;

  constructor(role: TerminalRole, meta?: SignalInputMeta) {
    this.role = role;
    this.meta = meta ?? {};
    this.step = this.step.bind(this);
    this.connectToNearestNode = this.connectToNearestNode.bind(this);
  }

  get position(): Vector3 {
    if (!this.entity) return new Vector3();
    return this.entity.position;
  }

  init(entity: TerminalCompatibleEntity) {
    this.entity = entity;
    this.connection = entity.behaviors.signal;
    if (!this.connection) {
      throw new Error(
        "TerminalBehavior requires a `signal` SignalConnectionBehavior sibling"
      );
    }

    const sprite = getAsset("ioNode").getSprite<
      ioNodeTypes.sprite_layers,
      ioNodeTypes.sprite_animations
    >();
    this.sprite = sprite;
    sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    sprite.hideLayers(
      "node_group",
      ...directionConfigs.flatMap((cfg) => [
        cfg.groupName,
        this.role === "input" ? cfg.outArrowName : cfg.inArrowName
      ])
    );
    sprite.showLayers("top_connection");
    sprite.gotoAnimation("connections_lit");
    sprite.center();
    entity.object3D?.add(sprite.mesh);

    entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.connection.events.on(
      SignalConnectionEvents.SignalReceived,
      (payload) => this.relay(payload)
    );
    return this;
  }

  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
    this.network = level.signalNetwork;
    if (level.fullyPreLoaded) {
      this.connectToNearestNode();
    } else {
      level.on(EntityLevelEvents.PreloadComplete, this.connectToNearestNode);
    }
  }

  detachFromLevel(level: EntityLevelAPI) {
    level.off(EntityLevelEvents.PreloadComplete, this.connectToNearestNode);
    this.detachNode();
    this.network = undefined;
    this.level = undefined;
  }

  private connectToNearestNode() {
    if (!this.entity || !this.level || !this.connection) return;
    if (this.node) return;

    let bestNode: SignalProcessorBehavior | undefined;
    let bestSlot: AttachmentSlotInfo | undefined;
    let bestDistance = IO_NODE_SNAP_DISTANCE;
    for (const other of this.level.getEntities().values()) {
      if (other === this.entity) continue;
      const processor = findSignalProcessorBehavior(other);
      if (!processor) continue;
      const slot = processor.getAttachmentSlot(this.entity.position);
      if (!slot) continue;
      const distance = distance3DTo2D(slot.position, this.entity.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = processor;
        bestSlot = slot;
      }
    }
    if (!bestNode || !bestSlot || !bestNode.entity) return;

    this.node = bestNode;
    this.node.events.on("ioReorganized", ({ inputs }) => {
      const thisInput = inputs.get(this);
      if (thisInput?.name !== "" && !!thisInput?.name) {
        this.addSlotLabel(thisInput.name);
      }
    });
    if (this.role === "input") {
      bestNode.registerInput(this, this.meta);
    } else {
      bestNode.registerOutput(this, { name: this.meta.name });
    }
    this.dockToSlot(bestSlot);
    this.nodeBus = this.connection.linkTo(bestNode.entity);
    this.sprite?.multiplyLayers(bestNode.getFrameColor(), 0.75, [
      "connection_top_left",
      "connection_top",
      "connection_top_right",
      "connection_left",
      "connection_right",
      "connection_bottom_left",
      "connection_bottom",
      "connection_bottom_right"
    ]);
  }

  private dockToSlot(slot: AttachmentSlotInfo) {
    if (!this.entity || !this.sprite) return;
    let bestMatch: DirectionalConfig | undefined;
    let bestMatchDot = -1;
    for (const cfg of directionConfigs) {
      const dot = cfg.vector
        .clone()
        .normalize()
        .dot(slot.direction.clone().normalize());
      if (dot > bestMatchDot) {
        bestMatchDot = dot;
        bestMatch = cfg;
      }
    }
    if (bestMatch) {
      this.sprite.hideLayers(
        ...directionConfigs
          .filter((cfg) => cfg !== bestMatch)
          .map((cfg) => cfg.groupName)
      );
      this.sprite.showLayers(bestMatch.groupName);
      this.arrowLayerName =
        this.role === "input" ? bestMatch.inArrowName : bestMatch.outArrowName;
    }
    this.sprite.center();
    if (this.entity.object3D) {
      this.sprite.mesh.rotation.z = -this.entity.object3D.rotation.z;
    }

    const terminalDepth = this.entity.position.z;
    this.entity.position.copy(slot.position);
    if (bestMatch?.offsetCorrection) {
      this.entity.position.add(vector2To3(bestMatch.offsetCorrection));
    }
    this.entity.position.z = terminalDepth + TERMINAL_DEPTH_BIAS;
    this.entity.object3D?.position
      .copy(this.entity.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    if (this.arrowLayerName) {
      this.sprite.setLayerOpacity(0.15, this.arrowLayerName);
    }
  }

  private addSlotLabel(label: string) {
    if (this.arrowLayerName) {
      this.sprite?.hideLayers(this.arrowLayerName);
    }
    this.events.emit("relabeled", label);
  }

  private relay({ signal, fromBus }: SignalReceivedPayload) {
    if (!this.entity || !this.node || !this.nodeBus || !this.connection) return;
    if (this.role === "input") {
      // wire → node: remap to the registered port name, node bus only
      if (fromBus === this.nodeBus) return;
      try {
        validateSignalData(signal.value);
      } catch (err) {
        console.warn("[Terminal] dropped invalid signal value:", err);
        return;
      }
      this.nodeBus.transmit(
        {
          value: signal.value,
          name: this.node.nameFor(this),
          sourceId: signal.sourceId
        },
        this.connection
      );
    } else {
      // node → wire: relay signals named like this port onto the tapped wires
      if (fromBus !== this.nodeBus) return;
      if (signal.name === undefined || signal.name !== this.node.nameFor(this))
        return;
      for (const bus of this.connection.links.keys()) {
        if (bus === this.nodeBus) continue;
        bus.transmit(
          { value: signal.value, sourceId: this.entity.id },
          this.connection
        );
      }
    }
    if (this.arrowLayerName) {
      this.scheduler.cancel("blink");
      this.scheduler.add({
        id: "blink",
        duration: 2500,
        invokeFunction: (t) => {
          if (!this.arrowLayerName) return;
          const phaseIn = (t * 5) % 1 > 0.5;
          this.sprite?.setLayerOpacity(phaseIn ? 1 : 0.75, this.arrowLayerName);
        }
      });
    }
  }

  private detachNode() {
    if (this.node) {
      this.node.unregister(this);
      this.node = undefined;
    }
    if (this.nodeBus) {
      this.network?.unregisterBus(this.nodeBus);
      this.nodeBus.destroy();
      this.nodeBus = undefined;
    }
  }

  step(ms: number) {
    this.scheduler.step(ms);
    this.sprite?.advance(ms);
    if (this.entity?.object3D) {
      this.entity.object3D.rotation.z = this.entity.angle;
    }
  }

  destroy() {
    this.entity?.events.off(EntityLifecycleEvents.Step, this.step);
    this.detachNode();
    this.sprite?.dispose();
  }
}
