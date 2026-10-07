import {
  CircleGeometry,
  Color,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry
} from "three";

import {
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps
} from "src/api/entity";
import { ItemRenderInstance } from "src/api/item";
import { SpellIconSpec } from "src/api/spellIcons";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { TextPixelated } from "src/entities/environment/TextPixelated";
import { Line2D } from "src/entities/shared/graphics/line/Line2D";
import { SpellDefinition } from "src/items/spells/spell";
import { DocId } from "src/docs/indexedDocs/docTypes";
import { BuiltInScriptId } from "src/scripting/builtinScripts/keys";

// Skill-tree palette (mirrors the SpiritDoor numeral gradient family).
const NODE_FILL_COLOR = 0x2a3058;
const NODE_RING_COLOR = 0xaae0ff;
const NODE_LEARNED_RING_COLOR = 0xffd24a;
const CONNECTION_COLOR = 0x4a5a8e;
/** Edge color once both of its endpoint nodes are learned. */
const CONNECTION_LEARNED_COLOR = 0xffd24a;

/** Name/key of the root skill: it has no prerequisites and is always learnable. */
export const CORE_SKILL_KEY = "console";

const DEFAULT_NODE_RADIUS = 0.5;
/** Small gap so an edge stops just outside the node rim instead of touching it. */
const CONNECTION_ENDPOINT_GAP = 0.06;
/** Local-space z offsets so the label/icon sits in front and edges behind. */
const LABEL_Z_OFFSET = 0.1;
const CONNECTION_Z_OFFSET = -0.1;

/**
 * Every spell-runtime API surfaced through `require("...")`, treated here as a
 * learnable ability. Values are the require() module names (kept in sync with
 * the generated `autoSpellApiManifests`).
 */
export enum SpellAbility {
  Aim = "aim",
  Air = "air",
  AreaPreview = "areaPreview",
  Earth = "earth",
  Fire = "fire",
  GetEntities = "getEntities",
  Grapple = "grapple",
  Heal = "heal",
  Ice = "ice",
  Info = "info",
  Ping = "ping",
  PlayerControls = "playerControls",
  PlayerInventory = "playerInventory",
  Projectile = "projectile",
  Self = "self",
  Sensor = "sensor",
  Shapes = "shapes",
  Spark = "spark",
  Speed = "speed",
  Spells = "spells",
  Tabs = "tabs",
  Terrain = "terrain",
  Vector = "vector",
  Wait = "wait"
}

/** The script-icon piece that represents each ability's import. Abilities with
 * no associated icon fall back to the text label. */
const ABILITY_ICON_KEY: Partial<Record<SpellAbility, string>> = {
  [SpellAbility.Fire]: "fireball",
  [SpellAbility.Ice]: "iceBolt",
  [SpellAbility.Spark]: "lightning",
  [SpellAbility.Earth]: "earthSpike",
  [SpellAbility.Air]: "air",
  [SpellAbility.Aim]: "aim",
  [SpellAbility.Ping]: "ping",
  [SpellAbility.Heal]: "healing",
  [SpellAbility.Grapple]: "grapple",
  [SpellAbility.Wait]: "delay"
};

/** A minimal spell standing in for an ability: tagged with the ability as its
 * sole import and given a single, centered, white script icon — that ability's
 * associated piece — rendered through SpellDefinition (the icon path needs no
 * scroll/emblem textures). Returns undefined when the ability has no icon. */
function abilityToSpellItemData(ability: SpellAbility) {
  const iconKey = ABILITY_ICON_KEY[ability];
  if (!iconKey) return undefined;
  const icon: SpellIconSpec = {
    layers: [
      { iconKey, position: { x: 0, y: 0 }, scale: 1, rotation: 0, color: 0xffffff }
    ]
  };
  const spell: SavedSpell = {
    id: `skill-tree-ability:${ability}`,
    name: ability,
    code: "",
    metadata: { imports: [ability], icon }
  };
  return savedSpellToItemData(spell);
}

export type SkillTreeNodeProps = EntityProps & {
  /** When set, the node shows this ability's spell icon in place of its label. */
  ability?: SpellAbility;
  /** Shown in the skill-description panel when this node is hovered. */
  description?: string;
  /** Shown instead of a description. */
  docsLink?: DocId;
  /** When set, learning this skill also grants this built-in spell preset. */
  unlocksPreset?: BuiltInScriptId;
};

// The node draws a TextPixelated label, so it owns that font dependency — the
// level preloader walks getAssetDependencies, guaranteeing the blob is loaded
// before the label is constructed.
@setAssetDependencies(() => ["directMessageBlob"])
export class SkillTreeNode extends CoreEntity {
  static type = "SkillTreeNode";
  public type = SkillTreeNode.type;

  public object3D = new Object3D();

  public readonly key: string;
  public readonly radius: number;
  public readonly ability?: SpellAbility;
  public readonly description?: string;
  public readonly docsLink?: DocId;
  public readonly unlocksPreset?: BuiltInScriptId;

  private readonly connections = new Set<SkillTreeConnection>();
  private readonly core: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;

  private learned = false;
  private attachedLevel?: EntityLevelAPI;
  private label?: TextPixelated;
  private abilityIcon?: ItemRenderInstance;

  constructor(props: SkillTreeNodeProps) {
    super(props);
    this.key = props.name ?? `${SkillTreeNode.type.toLowerCase()}:${this.id}`;
    this.ability = props.ability;
    this.description = props.description;
    this.docsLink = props.docsLink;
    this.unlocksPreset = props.unlocksPreset;

    const sized = Math.min(this.size.width, this.size.height) * 0.5;
    this.radius = sized > 0 ? sized : DEFAULT_NODE_RADIUS;

    // Filled disc with a bright rim, mirroring HitSignal's core/ring build.
    this.core = new Mesh(
      new CircleGeometry(this.radius, 32),
      new MeshBasicMaterial({ color: new Color(NODE_FILL_COLOR) })
    );
    this.ring = new Mesh(
      new RingGeometry(this.radius * 0.92, this.radius, 32),
      new MeshBasicMaterial({ color: new Color(NODE_RING_COLOR) })
    );
    this.object3D.add(this.core, this.ring);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    if (this.ability) this.renderAbilityIcon(this.ability);
  }

  /**
   * Renders the ability's spell scroll/emblem (a SpellDefinition render
   * instance) centered on the disc, in front of it. Falls back to the text
   * label if the spell textures aren't loaded (so the node still labels itself).
   */
  private renderAbilityIcon(ability: SpellAbility): void {
    const itemData = abilityToSpellItemData(ability);
    if (!itemData) return; // no associated icon — fall through to the label
    let icon: ItemRenderInstance;
    try {
      icon = SpellDefinition.getRenderInstance(itemData);
    } catch {
      return;
    }
    this.abilityIcon = icon;
    // getRenderInstance pre-scales its sprites by kInvPixelScale; size the whole
    // instance to sit comfortably inside the rim.
    icon.object3D.scale.multiplyScalar(this.radius * 0.4);
    icon.object3D.position.set(0, 0, LABEL_Z_OFFSET);
    this.object3D.add(icon.object3D);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.attachedLevel = level;

    // An ability node shows its spell icon (built in the constructor) instead
    // of a name label — only fall through to the label when there's no icon.
    if (this.abilityIcon) return;

    // The label is a real TextPixelated entity (it needs its own attach +
    // sampling lifecycle), pinned to this node's center just in front of the
    // disc. Constructed synchronously, the same way IOTerminals does it — the
    // font is already loaded thanks to this node's declared dependency.
    const label = new TextPixelated({
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z + LABEL_Z_OFFSET
      },
      size: { width: this.radius * 1.8, height: this.radius * 1.8 },
      text: this.key,
      font: "directMessage",
      fontSize: 6,
      horizontalAlign: "center",
      verticalAlign: "center",
      color: "#ffffff",
      shouldWrap: true,
      autoShrinkFontSize: true,
      autoShrinkFontSizeMin: 4
    });
    this.label = label;
    level.addEntity(label);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    this.attachedLevel = undefined;
    if (this.label) {
      level.removeEntity(this.label.id);
      this.label = undefined;
    }
    super.detachFromLevel(level);
  }

  /** Records a connection that has this node as one of its endpoints. */
  addConnection(connection: SkillTreeConnection): void {
    this.connections.add(connection);
  }

  /** Drops a connection from this node (no-op if it was never registered). */
  removeConnection(connection: SkillTreeConnection): void {
    this.connections.delete(connection);
  }

  /** Every connection touching this node. */
  getConnections(): SkillTreeConnection[] {
    return [...this.connections];
  }

  /** Nodes reachable from this one across a single connection. */
  getNeighbors(): SkillTreeNode[] {
    const neighbors: SkillTreeNode[] = [];
    for (const connection of this.connections) {
      const other = connection.opposite(this);
      if (other) neighbors.push(other);
    }
    return neighbors;
  }

  get isLearned(): boolean {
    return this.learned;
  }

  /** The root skill — always learnable, with no prerequisite. */
  get isCore(): boolean {
    return this.key === CORE_SKILL_KEY;
  }

  /**
   * Whether this skill is eligible to be learned right now: the core skill is
   * always eligible, and every other skill becomes eligible once at least one
   * of its neighbors in the connection graph has been learned.
   */
  get isUnlockable(): boolean {
    if (this.isCore) return true;
    return this.getNeighbors().some((node) => node.isLearned);
  }

  /** Toggles the learned state, recoloring the rim to signal it. */
  setLearned(learned: boolean): void {
    if (this.learned === learned) return;
    this.learned = learned;
    this.ring.material.color.set(
      learned ? NODE_LEARNED_RING_COLOR : NODE_RING_COLOR
    );
  }

  destroy(): void {
    // Removing a node tears down its dangling edges so the graph stays
    // consistent. Iterate a copy since destroy() mutates the set below.
    for (const connection of [...this.connections]) {
      connection.destroy();
    }
    this.connections.clear();

    if (this.label) {
      this.attachedLevel?.removeEntity(this.label.id);
      this.label = undefined;
    }
    this.attachedLevel = undefined;

    if (this.abilityIcon) {
      this.object3D.remove(this.abilityIcon.object3D);
      this.abilityIcon.dispose?.();
      this.abilityIcon = undefined;
    }

    this.core.geometry.dispose();
    this.core.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();

    super.destroy();
  }
}

export type SkillTreeConnectionProps = EntityProps;

export class SkillTreeConnection extends CoreEntity {
  static type = "SkillTreeConnection";
  public type = SkillTreeConnection.type;

  public object3D = new Object3D();

  private start?: SkillTreeNode;
  private end?: SkillTreeNode;

  private attachedLevel?: EntityLevelAPI;
  private line?: Line2D;

  constructor(props: SkillTreeConnectionProps) {
    super(props);
    // Edges are drawn in this entity's local space (object3D pinned to its
    // position, like RuneConnector), nudged back in z so wires sit behind the
    // nodes.
    this.object3D.position.copy(this.position);
    this.object3D.position.z += CONNECTION_Z_OFFSET;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.attachedLevel = level;
    // Endpoint nodes may not be added yet, so wait until the whole level has
    // finished loading before snapping to them (mirrors SignalConnectionBehavior
    // / SpiritDoor).
    if (level.fullyPreLoaded) {
      this.resolveEndpoints();
    } else {
      level.on(EntityLevelEvents.PreloadComplete, this.resolveEndpoints);
    }
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.PreloadComplete, this.resolveEndpoints);
    this.unbindEndpoints();
    this.attachedLevel = undefined;
    super.detachFromLevel(level);
  }

  private readonly resolveEndpoints = (): void => {
    const anchors = this.endpointAnchors();
    if (anchors) {
      this.bindEndpoint("start", anchors[0]);
      this.bindEndpoint("end", anchors[1]);
    }
    this.rebuildLine();
  };

  /**
   * World-space anchor points for this edge's two ends. Taken from the authored
   * polyline (first and last vertices, which Tiled gives in local space), so an
   * edge is just a line drawn between the two nodes it should join.
   */
  private endpointAnchors(): [Vector2Like, Vector2Like] | undefined {
    const polyline = this.initialProps.polyline;
    if (!polyline || polyline.length < 2) return undefined;
    const first = polyline[0];
    const last = polyline[polyline.length - 1];
    return [
      { x: this.position.x + first.x, y: this.position.y + first.y },
      { x: this.position.x + last.x, y: this.position.y + last.y }
    ];
  }

  /** Snaps one endpoint to the SkillTreeNode nearest its authored anchor. */
  private bindEndpoint(which: "start" | "end", anchor: Vector2Like): void {
    if (this[which]) return;
    const node = this.findNearestNode(anchor);
    if (!node) return;
    // Don't let both ends collapse onto the same node (a self-loop).
    const other = which === "start" ? this.end : this.start;
    if (node === other) return;
    this[which] = node;
    node.addConnection(this);
  }

  private findNearestNode(point: Vector2Like): SkillTreeNode | undefined {
    const level = this.attachedLevel;
    if (!level) return undefined;
    let nearest: SkillTreeNode | undefined;
    let nearestDistSq = Infinity;
    for (const entity of level.getEntities().values()) {
      if (entity.type !== SkillTreeNode.type) continue;
      const node = entity as SkillTreeNode;
      const dx = node.position.x - point.x;
      const dy = node.position.y - point.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = node;
      }
    }
    return nearest;
  }

  /**
   * (Re)draws the edge as a segment whose ends are snapped to just outside each
   * node's radius, so the wire meets the rims rather than the centers. Points
   * are emitted in this entity's local space (relative to its position).
   */
  private rebuildLine(): void {
    this.disposeLine();
    const start = this.start;
    const end = this.end;
    if (!start || !end) return;

    const dx = end.position.x - start.position.x;
    const dy = end.position.y - start.position.y;
    const length = Math.hypot(dx, dy);
    const startInset = start.radius + CONNECTION_ENDPOINT_GAP;
    const endInset = end.radius + CONNECTION_ENDPOINT_GAP;
    // Nodes too close to leave a visible gap between their rims — skip drawing.
    if (length <= startInset + endInset) return;

    const ux = dx / length;
    const uy = dy / length;
    const p0: [number, number] = [
      start.position.x + ux * startInset - this.position.x,
      start.position.y + uy * startInset - this.position.y
    ];
    const p1: [number, number] = [
      end.position.x - ux * endInset - this.position.x,
      end.position.y - uy * endInset - this.position.y
    ];

    this.line = new Line2D([p0, p1]);
    this.line.recolor(this.litColor());
    this.object3D.add(this.line.mesh);
  }

  /** Gold once both endpoints are learned, otherwise the resting wire color. */
  private litColor(): number {
    const lit = !!this.start?.isLearned && !!this.end?.isLearned;
    return lit ? CONNECTION_LEARNED_COLOR : CONNECTION_COLOR;
  }

  /** Recolors the wire to reflect the current learned state of its endpoints. */
  refreshLearnedState(): void {
    this.line?.recolor(this.litColor());
  }

  private disposeLine(): void {
    if (!this.line) return;
    this.object3D.remove(this.line.mesh);
    this.line.mesh.geometry.dispose();
    (this.line.mesh.material as Material).dispose();
    this.line = undefined;
  }

  private unbindEndpoints(): void {
    this.start?.removeConnection(this);
    this.end?.removeConnection(this);
    this.start = undefined;
    this.end = undefined;
  }

  /** The node at this connection's start, once resolved. */
  get startNode(): SkillTreeNode | undefined {
    return this.start;
  }

  /** The node at this connection's end, once resolved. */
  get endNode(): SkillTreeNode | undefined {
    return this.end;
  }

  /** Given one endpoint, returns the node at the other end (if any). */
  opposite(node: SkillTreeNode): SkillTreeNode | undefined {
    if (node === this.start) return this.end;
    if (node === this.end) return this.start;
    return undefined;
  }

  destroy(): void {
    this.disposeLine();
    this.unbindEndpoints();
    this.attachedLevel = undefined;
    super.destroy();
  }
}

type Vector2Like = { x: number; y: number };
