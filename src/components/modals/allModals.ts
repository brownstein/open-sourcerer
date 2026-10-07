import { KnownModalNames, ModalDefinitionType, ModalName } from "src/api/modal";
import { RegistryProvider } from "src/api/registry";
import { createTypedEventEmitter } from "src/api/util";
import { DeleteUnknownLayerModalDefinition } from "src/components/level-editor/DeleteUnknownLayerModal";
import { LevelEditorPropTextModalDefinition } from "src/components/level-editor/LevelEditorPropTextModal";
import { CollabRoomModalDefinition } from "src/components/level-editor/collab/CollabRoomModal";
import { EditIdentityModalDefinition } from "src/components/level-editor/collab/EditIdentityModal";
import { LeaveRoomModalDefinition } from "src/components/level-editor/collab/LeaveRoomModal";
import { RoomSaveConflictModalDefinition } from "src/components/level-editor/collab/RoomSaveConflictModal";
import { LevelManagerModalDefinition } from "src/components/level-editor/level-manager/LevelManagerModal";
import { DocMediaPreviewModalDefinition } from "src/docs/components/DocMediaPreview/DocMediaPreview";
import { MatchRoomModalDefinition } from "src/multiplayer/ui/MatchRoomModal";

import { CharacterCustomizationModalDefinition } from "./character/CharacterCustomizationModal";
import { LevelSelectModalDefinition } from "./dev/LevelSelect";
import { SpellSelectModalDefinition } from "./dev/SpellSelect";
import { EntityCodeModalDefinition } from "./entity/EntityCode";
import { SkillTreeDetailModalDefinition } from "./skill-tree/SkillTreeDetailModal";
import { DeleteSpellModalDefinition } from "./spell/DeleteSpell";
import { LoadSpellModalDefinition } from "./spell/LoadSpell";
import { SaveSpellModalDefinition } from "./spell/SaveSpell";

const defaultModals: ModalDefinitionType<string>[] = [
  SaveSpellModalDefinition as ModalDefinitionType<string>,
  LoadSpellModalDefinition as ModalDefinitionType<string>,
  DeleteSpellModalDefinition as ModalDefinitionType<string>,
  EntityCodeModalDefinition as ModalDefinitionType<string>,
  DocMediaPreviewModalDefinition as ModalDefinitionType<string>,
  LevelSelectModalDefinition as ModalDefinitionType<string>,
  LevelManagerModalDefinition as ModalDefinitionType<string>,
  LevelEditorPropTextModalDefinition as ModalDefinitionType<string>,
  CollabRoomModalDefinition as ModalDefinitionType<string>,
  LeaveRoomModalDefinition as ModalDefinitionType<string>,
  EditIdentityModalDefinition as ModalDefinitionType<string>,
  RoomSaveConflictModalDefinition as ModalDefinitionType<string>,
  DeleteUnknownLayerModalDefinition as ModalDefinitionType<string>,
  SpellSelectModalDefinition as ModalDefinitionType<string>,
  SkillTreeDetailModalDefinition as ModalDefinitionType<string>,
  MatchRoomModalDefinition as ModalDefinitionType<string>,
  CharacterCustomizationModalDefinition as ModalDefinitionType<string>
];
export class ModalsRegistry implements RegistryProvider<ModalDefinitionType> {
  public events = createTypedEventEmitter<{ reload: void }>();
  private modals = new Map<string, ModalDefinitionType>();
  get<K extends KnownModalNames>(key: K): ModalDefinitionType<K>;
  get(key: string): ModalDefinitionType | null;
  get(key: KnownModalNames | string) {
    return this.modals.get(key) ?? null;
  }
  add(key: string, definition: ModalDefinitionType) {
    this.modals.set(key, definition);
  }
  keys() {
    return [...this.modals.keys()];
  }
}

export const modalsRegistry = new ModalsRegistry();
for (const modal of defaultModals) modalsRegistry.add(modal.modalName, modal);
