import { TFunction } from "i18next";

import { RegistryProvider } from "src/api/registry";
import { createTypedEventEmitter } from "src/api/util";
import { CodingChallengeTab } from "src/components/coding-challenge/CodingChallenge";
import { DemoModeTab } from "src/components/demo/DemoModeTab";
import { ComponentDebugTab } from "src/components/dev/ComponentDebug";
import { DebugTab } from "src/components/dev/Debug";
import { VisualizerTab } from "src/components/dev/EntityVisualizer";
import { LevelSelectorTab } from "src/components/dev/LevelSelector";
import { DocsTab } from "src/components/docs/DocsTab";
import { CodeEditor } from "src/components/editor/CodeEditor";
import { Console } from "src/components/editor/Console";
import { InventoryTab } from "src/components/inventory/Inventory";
import { LevelEditorPreloaderTab } from "src/components/level-editor/LevelEditorPreloader";
import { QuestLogTab } from "src/components/quest-log/QuestLog";
import { SettingsTab } from "src/components/settings/Settings";
import { STViewport } from "src/components/skill-tree/SkillTreeViewport";
import { Viewport } from "src/components/viewport/Viewport";

import { UIComponentType, uiComponents } from "../config/types";
import { ComponentConfigType } from "../config/types";

export const DefaultUIComponents = uiComponents({
  viewport: {
    displayName: (t: TFunction) => t("componentNames.viewport"),
    iconClassName: "svg-icon game-logo",
    component: Viewport
  },
  stviewport: {
    displayName: (t: TFunction) => "Skill Tree",
    iconClassName: "svg-icon skills-fill",
    component: STViewport
  },
  codeEditor: {
    displayName: (t: TFunction, config?: ComponentConfigType<"codeEditor">) => {
      if (config?.scriptName) {
        return `${t("componentNames.editor")}: ${config.scriptName}`;
      }
      return t("componentNames.editor");
    },
    minimumWidth: 300,
    iconClassName: "svg-icon terminal-fill",
    component: CodeEditor
  },
  console: {
    displayName: (t: TFunction) => t("componentNames.console"),
    minimumWidth: 200,
    iconClassName: "svg-icon terminal-fill",
    component: Console
  },
  levelSelector: {
    displayName: (t: TFunction) => t("componentNames.levelSelector"),
    iconClassName: "svg-icon level-select-fill",
    component: LevelSelectorTab
  },
  debug: {
    displayName: (t: TFunction) => t("componentNames.debug"),
    iconClassName: "svg-icon bug-fill",
    component: DebugTab
  },
  inventory: {
    displayName: (t: TFunction) => t("componentNames.inventory"),
    iconClassName: "svg-icon inventory-fill",
    component: InventoryTab,
    minimumWidth: 200,
    minimumHeight: 200
  },
  docs: {
    displayName: (t: TFunction) => t("componentNames.docs"),
    minimumWidth: 300,
    iconClassName: "svg-icon file-fill",
    component: DocsTab
  },
  settings: {
    displayName: (t: TFunction) => t("componentNames.settings"),
    iconClassName: "svg-icon settings-fill",
    component: SettingsTab
  },
  demoMode: {
    displayName: (t: TFunction) => t("componentNames.demoMode"),
    iconClassName: "svg-icon icon-tome",
    component: DemoModeTab
  },
  visualizer: {
    displayName: (t: TFunction) => t("componentNames.entityVisualizer"),
    iconClassName: "svg-icon icon-tome",
    component: VisualizerTab
  },
  skillTree: {
    displayName: (t: TFunction) => t("componentNames.skillTree"),
    iconClassName: "svg-icon skills-fill",
    component: STViewport
  },
  codingChallenge: {
    displayName: (t: TFunction) => t("componentNames.codingChallenge"),
    minimumWidth: 300,
    iconClassName: "svg-icon icon-tome",
    component: CodingChallengeTab
  },
  componentDebug: {
    displayName: (t: TFunction) => t("componentNames.componentDebug"),
    iconClassName: "svg-icon icon-tome",
    component: ComponentDebugTab
  },
  questLog: {
    displayName: (t: TFunction) => t("componentNames.questLog"),
    iconClassName: "svg-icon icon-tome",
    component: QuestLogTab
  },
  levelEditor: {
    displayName: (t: TFunction) => "Level Editor",
    iconClassName: "svg-icon level-select-fill",
    component: LevelEditorPreloaderTab
  }
});

export type DefaultComponentDefinitionNames = keyof typeof DefaultUIComponents;

export class TabComponentRegistry implements RegistryProvider<UIComponentType> {
  public events = createTypedEventEmitter<{
    reload: void;
  }>();
  private components = new Map<string, UIComponentType>();
  get<K extends DefaultComponentDefinitionNames>(
    key: K
  ): (typeof DefaultUIComponents)[K];
  get(key: string): UIComponentType | null;
  get(key: string | DefaultComponentDefinitionNames) {
    return this.components.get(key) ?? null;
  }
  add(key: string, componentDef: UIComponentType) {
    this.components.set(key, componentDef);
  }
  keys() {
    return [...this.components.keys()];
  }
}

export const tabComponentRegistry = new TabComponentRegistry();
for (const [key, componentDef] of Object.entries(DefaultUIComponents)) {
  tabComponentRegistry.add(key, componentDef as UIComponentType);
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    for (const [key, componentDef] of Object.entries(DefaultUIComponents)) {
      tabComponentRegistry.add(key, componentDef as UIComponentType);
    }
    tabComponentRegistry.events.emit("reload");
  });
}
