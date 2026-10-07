import { Color, Object3D, Vector2 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import { ItemRenderInstance } from "src/api/item";
import { OverlayPosition } from "src/api/overlay";
import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import {
  ItemGoingPlaces,
  ItemJuiceOverlayProps,
  ItemPickupJuice
} from "src/components/ui/overlays/overlays/ItemPickupJuice";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Player } from "src/entities/player/Player";
import { GlowParticlesBehavior } from "src/entities/shared/behaviors/GlowParticles";
import {
  ItemPhysicsBehavior,
  ItemPhysicsEvents
} from "src/entities/shared/behaviors/ItemPhysics";
import { SpellDefinition } from "src/items/spells/spell";
import closedScrollPng from "src/items/spells/sprites/scroll-closed.png";
import openScrollJson from "src/items/spells/sprites/scroll-open.json";
import openScrollPng from "src/items/spells/sprites/scroll-open.png";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { builtInSpells } from "src/scripting/builtinScripts";
import { BuiltInScriptId } from "src/scripting/builtinScripts/keys";

export type DroppedSpellProps = EntityProps & {
  spell?: SavedSpell;
  builtin?: BuiltInScriptId;
  code?: string;
};

@addResourceLoader(
  new TextureResourceLoader("openScrollTexture", openScrollPng)
)
@addResourceLoader(
  new TextureResourceLoader("closedScrollTexture", closedScrollPng)
)
export class DroppedSpell extends CoreEntity {
  static type = "DroppedSpell";
  public type = "DroppedSpell";
  public object3D = new Object3D();
  public behaviors = {
    physics: new ItemPhysicsBehavior(),
    particles: new GlowParticlesBehavior()
  };
  private spell?: SavedSpell;
  private sprite?: ThreeAseprite;
  private renderInstance?: ItemRenderInstance;
  constructor(props: DroppedSpellProps) {
    super(props);

    let builtInSpell: SavedSpell | undefined;
    if (props.builtin) {
      builtInSpell = builtInSpells[props.builtin];
    }

    this.spell = props.spell ?? builtInSpell;
    this.size = {
      width: 0.5,
      height: 0.5
    };

    if (this.spell) {
      this.renderInstance = SpellDefinition.getRenderInstance(
        savedSpellToItemData(this.spell)
      );
      this.renderInstance.object3D.scale.multiplyScalar(kInvPixelScale * 8);
      this.renderInstance.object3D.scale.x *= this.size.width;
      this.renderInstance.object3D.scale.y *= this.size.height;
      this.object3D.add(this.renderInstance.object3D);
    } else {
      this.sprite = new ThreeAseprite({
        texture: getResource(DroppedSpell, "openScrollTexture"),
        sourceJSON: openScrollJson,
        frameName: (p) => `(${p.layerName}) ${p.frame}`
      });
      this.sprite.setLayerOpacities({
        Glow: 0
      });
      this.sprite.gotoFrame(0);
      this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * 0.25);
      this.object3D.add(this.sprite.mesh);
    }
    this.object3D.position.copy(this.position);

    this.behaviors.physics.init(this);
    this.behaviors.particles.init(this);

    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      if (ms === 0) {
        p.position.x = (Math.random() - 0.5) * this.size.width * 1.5;
        p.position.y = (Math.random() - 0.5) * this.size.height * 1.5;
        p.velocity.multiplyScalar(0.25);
        p.color = new Color(0xffffff);
        p.lifetimeMs = 800;
      } else {
        p.size = 0.15 * Math.sin((Math.PI * p.ms) / p.lifetimeMs);
      }
    };
    this.behaviors.particles.object3D.position.z = -1;

    this.behaviors.physics.events.on(
      ItemPhysicsEvents.CollideWithEntity,
      ([entity]) => {
        if (entity.type === Player.type) {
          this.pickup();
        }
      }
    );
  }
  destroy() {
    super.destroy();
    this.sprite?.dispose();
    this.renderInstance?.dispose?.();
  }
  pickup() {
    const { level } = this;
    if (!level) return;

    // TODO: make this juicy pickup stuff a standard behavior.
    const { center, size } = level.cameraDirector.getCurrentProperties();
    const cameraSize = size;
    const cameraCenter = center;
    if (!cameraSize || !cameraCenter) return;

    const viewportPosRelative = vector3To2(this.position);
    viewportPosRelative.sub(cameraCenter);
    viewportPosRelative.divide(cameraSize);
    viewportPosRelative.x += 0.5;
    viewportPosRelative.y *= -1;
    viewportPosRelative.y += 0.5;

    const viewportSizeRelative = new Vector2(this.size.width, this.size.height);
    viewportSizeRelative.divide(cameraSize);

    if (!this.spell) return;

    level.ctx?.overlayProvider?.addOverlay<ItemJuiceOverlayProps>({
      component: ItemPickupJuice,
      position: OverlayPosition.Screen,
      overlayProps: {
        viewportPosRelative,
        viewportSizeRelative,
        item: savedSpellToItemData(this.spell),
        wheresItGoing: ItemGoingPlaces.HotBar,
        andWhenItGetsThere: () => {
          if (!this.spell) return;
          store.dispatch(
            addItems({
              item: savedSpellToItemData(this.spell),
              hotkey: true
            })
          );
          const state = store.getState();

          // // Open the spell editing tutorial.
          // const completedSpellEditorTutorial = selectTutorialCompleted(
          //   state,
          //   T001YouFoundASpell.id
          // );
          // if (!completedSpellEditorTutorial) {
          //   store.dispatch(startTutorial(T001YouFoundASpell.id));
          // }

          // FIXME (there can be multiple code editors).
          // const codeEditors = selectAllScriptEditors(state);
          // const firstEditor = codeEditors[0];
          // if (!firstEditor) return;
          // store.dispatch(
          //   upsertEditor({
          //     ...firstEditor,
          //     code: this.spell.code,
          //     codeUpdatedAt: Date.now()
          //   })
          // );
        }
      }
    });

    // Detach physics to end collisions.
    this.behaviors.physics.detachFromLevel();

    this.scheduler.add({
      startIn: 100,
      invokeFunction: (t) => {
        this.sprite?.setOpacity(1 - t);
      },
      invokeFunctionAtComplete: () => {
        level.removeEntity(this.id);
      }
    });
  }
}
