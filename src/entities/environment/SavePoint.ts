import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D, Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityProps,
  EntitySnapshot,
  LevelAPI
} from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addResourceLoader,
  getResource,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { Text } from "src/entities/environment/Text";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";
import { selectActiveAllies } from "src/redux/gameState/selectors";
import { incrementHealth, incrementMana } from "src/redux/status/slice";
import { store } from "src/redux/store";

import { Player } from "../player/Player";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "../player/PlayerAPI";
import saveFountainJson from "./sprites/save-fountain/save-fountain.json";
import saveFountainPng from "./sprites/save-fountain/save-fountain.png";

export type SavePointProps = EntityProps & {
  activated?: boolean;
};

@addResourceLoader(
  new TextureResourceLoader("saveFountainTexture", saveFountainPng)
)
@setConsumerDependencies(() => [Player])
export class SavePoint extends CoreEntity implements InteractionProvider {
  static type = "SavePoint";
  public type = "SavePoint";
  public object3D = new Object3D();
  public alignment = EntityAlignment.Environment;
  private sprite: ThreeAseprite;
  private activated = false;
  private focused = false;
  private focusPrompt?: KeyboardKeyPrompt;
  private gameSavedText?: Text;
  private sensor?: Collider;
  private nearPlayer?: PlayerAPI;
  private attachedLevel?: EntityLevelAPI;
  constructor(props: SavePointProps) {
    super(props);
    this.activated = !!props.activated;
    this.size = {
      width: 64 * kInvPixelScale,
      height: 64 * kInvPixelScale
    };
    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(SavePoint, "saveFountainTexture"),
      sourceJSON: saveFountainJson
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);
    this.object3D.position.z--;

    this.setFocused = this.setFocused.bind(this);
    this.onInteract = this.onInteract.bind(this);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.attachedLevel = level;

    // If activated, spawn/move the player to the save point.
    level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);

    // Add sensor to detect player.
    // TODO: standardize this logic in a behavior.
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.size.width * 0.5,
      this.size.height * 0.5
    )
      .setTranslation(this.position.x, this.position.y)
      .setSensor(true);
    this.sensor = level.world.createCollider(colliderDesc);
    level.registerSensor(this.id, this.sensor.handle);
  }
  detachFromLevel(level: LevelAPI): void {
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    super.detachFromLevel(level);
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
    this.attachedLevel = undefined;
  }
  private readonly onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    if (!this.activated) return;
    let player: PlayerAPI | undefined;
    for (const entity of level.getEntities().values()) {
      if (isPlayerAPI(entity)) {
        player = entity;
        break;
      }
    }
    // If the level lacks an initial player, add one in the correct position.
    if (player === undefined) {
      player = new Player({
        position: this.position.clone()
      });
      level.addEntity(player);
    }

    const tpPosition = this.position.clone();
    tpPosition.y -= this.size.height / 2;
    tpPosition.y += player.size.height / 2;
    player.teleport?.(tpPosition);

    // TODO: do this with doors as well.
    const state = store.getState();
    const activeAllies = selectActiveAllies(state);
    if (activeAllies?.length) {
      const entitiesRegistry = level.ctx?.registry?.entities;
      if (!entitiesRegistry) {
        console.warn(
          "No entities registry supplied, cannot instantiate allies, fix DI"
        );
        return;
      }
      for (const allyClazzName of activeAllies) {
        const AllyClazz = entitiesRegistry.get(allyClazzName);
        if (!AllyClazz) throw new Error(`Missing ally: ${allyClazzName}`);
        let ally = level.getEntitiesForType(AllyClazz).at(0);
        if (!ally) {
          ally = new AllyClazz({
            position: tpPosition,
            hotSpawnedAtSave: true
          });
          level.addEntity(ally);
        }
        ally.teleport?.(tpPosition);
      }
    }
  };
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
    if (!this.sensor) return;
    let nearPlayer: PlayerAPI | undefined;
    this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
      const otherEntityId = this.level?.getEntityIdForCollider(
        collider2.handle
      );
      if (!otherEntityId) return;
      const otherEntity = this.level?.getEntity(otherEntityId);
      if (!otherEntity) return;
      if (!isPlayerAPI(otherEntity)) return;
      nearPlayer = otherEntity;
    });
    if (nearPlayer !== this.nearPlayer) {
      if (nearPlayer) {
        this.nearPlayer = nearPlayer;
        this.nearPlayer.addInteraction(this.id, this);
      } else {
        this.setFocused(false);
        this.nearPlayer?.removeInteraction(this.id);
        this.nearPlayer = undefined;
      }
    }
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  getSnapshot() {
    const snapshot = super.getSnapshot();
    snapshot.activated = this.activated;
    return snapshot;
  }
  applySnapshot(snapshot: EntitySnapshot): void {
    super.applySnapshot(snapshot);
    this.activated = !!snapshot.activated;
  }
  setFocused(focused: boolean) {
    if (focused !== this.focused) {
      if (focused) {
        const promptPos = this.position.clone();
        promptPos.y += 1.5;
        const prompt = new KeyboardKeyPrompt({ position: promptPos, key: "e" });
        this.level?.addEntity(prompt);
        this.focusPrompt = prompt;
      } else {
        if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
        this.focusPrompt = undefined;
        this.activated = false;
      }
    }
    this.focused = focused;
    this.sprite.setOutline(focused ? 1 : 0, 0x22aaff, 1);
  }
  onInteract() {
    const { level } = this;
    this.activated = true;
    store.dispatch(incrementHealth(999));
    store.dispatch(incrementMana(999));
    level?.ctx?.saveStore?.saveGame();
    this.focusPrompt?.markPressed();
    this.nearPlayer?.removeInteraction(this.id);
    const gameSaveTextPosition = this.position.clone();
    const initialSaveTextPosition = gameSaveTextPosition.clone();
    gameSaveTextPosition.y += 2.5;
    this.gameSavedText = new Text({
      position: gameSaveTextPosition,
      text: "Game Saved",
      textAlign: "center"
    });
    this.level?.addEntity(this.gameSavedText);
    this.scheduler.add({
      id: "moveGameSavedText",
      duration: 1500,
      invokeFunction: (t) => {
        gameSaveTextPosition.y = initialSaveTextPosition.y + t;
        this.gameSavedText?.position.copy(gameSaveTextPosition);
      },
      invokeFunctionAtComplete: () => {
        if (!this.gameSavedText) return;
        this.level?.removeEntity(this.gameSavedText.id);
        this.gameSavedText = undefined;
      }
    });
  }
}
