import { t } from "i18next";
import { Color, Object3D } from "three";

import {
  BaseEntityType,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { EntityCodeInjectionAPI } from "src/api/entityCodeInjection";
import {
  SpellValidator,
  createSpellValidationDeferredEmitter,
  spellValidatorResultIsValid
} from "src/api/spellValidation";
import { SpellCtx, SpellCtxEvents } from "src/api/spells";
import { createTypedEventEmitter, typedEmitterPromise } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { pushModalTyped } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { Text } from "../Text";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "../behaviors/InteractionBehavior";

export enum AncientConsoleEvents {
  Activate = "Activate",
  RunStarted = "RunStarted",
  RunComplete = "RunComplete"
}

export type AncientConsoleEventTypes = EntityLifecycleEventTypes & {
  [AncientConsoleEvents.Activate]: void;
  [AncientConsoleEvents.RunStarted]: string;
  [AncientConsoleEvents.RunComplete]: [boolean, unknown];
};

export type CodeRunnerPrototypeProps = EntityProps & {
  validator?: SpellValidator;
};

@setAssetDependencies(() => ["shrineTerminalSprite"])
export class AncientConsole
  extends CoreEntity
  implements BaseEntityType, EntityCodeInjectionAPI
{
  static type = "AncientConsole";
  public type = AncientConsole.type;

  public events = createTypedEventEmitter<AncientConsoleEventTypes>();
  public behaviors = {
    interaction: new InteractionBehavior()
  };
  public object3D = new Object3D();

  private sprite = getAsset("shrineTerminalSprite").getSprite();
  private runner?: SpellCtx;
  private currentCode?: string;
  private promptName: string = "mini/Prototype";
  private resultText?: Text;

  static DefaultValidator: SpellValidator = (ctx) => {
    const deferred = createSpellValidationDeferredEmitter();
    const asyncLogic = async () => {
      const [success, result] = await Promise.race([
        typedEmitterPromise(
          ctx.spellCtx.events,
          SpellCtxEvents.runComplete
        ).then((r) => [true, r] as [boolean, unknown]),
        typedEmitterPromise(ctx.spellCtx.events, SpellCtxEvents.runError).then(
          (e) => [false, e] as [boolean, unknown]
        )
      ]);
      if (success) {
        deferred.emit("done", {
          type: "valid",
          finalResult: result
        });
        return;
      }
      deferred.emit("error", {
        type: "invalid",
        error: result
      });
    };
    asyncLogic();
    return deferred;
  };

  private validator: SpellValidator = AncientConsole.DefaultValidator;

  constructor(props: CodeRunnerPrototypeProps) {
    super(props);

    this.validator = props.validator ?? this.validator;
    if (typeof props.promptName === "string") this.promptName = props.promptName;

    this.sprite.center();
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.sprite.fadeAllLayers(new Color(0.4, 0.25, 0), 0.5);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.interaction.init(this);
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.SetFocused,
      (focused) => {
        this.sprite.outlineAllLayers(focused ? 1 : 0, new Color(0x4488ff), 1);
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.Interact,
      () => {
        this.events.emit(AncientConsoleEvents.Activate);
        this.launchModal();
      }
    );
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
    this.runner?.terminate();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  setValidator(validator: SpellValidator) {
    this.validator = validator;
  }
  private launchModal() {
    const { level } = this;
    if (!level) return;
    if (this.runner?.running) this.runner?.terminate();
    this.runner = undefined;
    store.dispatch(
      pushModalTyped({
        modalName: "entityCode",
        modalArg: {
          entityId: this.id,
          currentCode: this.currentCode,
          promptName: this.promptName
        }
      })
    );
  }
  async acceptCode(code: string) {
    if (!this.level) return;
    this.events.emit(AncientConsoleEvents.RunStarted, code);
    this.currentCode = code;
    if (this.resultText) {
      this.level?.removeEntity(this.resultText.id);
      this.resultText.destroy();
      this.resultText = undefined;
    }
    const runner = await this.level?.ctx?.spells?.run(code, this.id);
    this.runner = runner;
    if (!runner) return;
    try {
      const validation = await this.validator({
        spellCtx: runner,
        level: this.level,
        t
      }).getPromise();
      if (spellValidatorResultIsValid(validation)) {
        this.events.emit(AncientConsoleEvents.RunComplete, [true, validation.finalResult]);
        this.sprite.outlineAllLayers(1, new Color(0, 1, 0), 1);
        const result = validation.finalResult;
        if (result) {
          const resultString = String(result);
          const resultPosition = this.position.clone();
          resultPosition.y += 2;
          this.resultText = new Text({
            text: resultString,
            position: resultPosition
          });
          this.level?.addEntity(this.resultText);
        }
      } else {
        this.events.emit(AncientConsoleEvents.RunComplete, [false, validation.error]);
        this.sprite.outlineAllLayers(1, new Color(1, 0, 0), 1);
      }
    } catch (err) {
      this.events.emit(AncientConsoleEvents.RunComplete, [false, err]);
      this.sprite.outlineAllLayers(1, new Color(1, 0, 0), 1);
    }
  }
}
