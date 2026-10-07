import { ParseKeys } from "i18next";
import { ComponentType } from "react";

import { DocId } from "src/docs/indexedDocs/docTypes";
import { BuiltInScriptId } from "src/scripting/builtinScripts/keys";

import { PrimitiveData, PrimitiveTypeName } from "./data";
import { SavedSpell } from "./spells";

export type ValueEditorConfig = {
  label?: string;
  value?: PrimitiveData;
  locked?: boolean;
} & (
  | {
      kind: PrimitiveTypeName;
      range?: { min: number; max: number; step?: number };
    }
  | { kind: "choices"; choices: { value: string; label: string }[] }
);

export type KnownModalArgTypes = {
  saveSpell: {
    code: string;
    existingSpell?: SavedSpell;
    duplicatingSpell?: SavedSpell;
    codeEditorId?: string;
    editInPlace?: boolean;
  };
  loadSpell: {
    codeEditorId: string;
  };
  deleteSpell: {
    spell: SavedSpell;
  };
  entityCode: {
    entityId: string;
    promptName?: string;
    promptString?: string;
    presetCode?: string;
    currentCode?: string;
    editorId?: string;
    inputVariables?: string[];
    outputVariables?: string[];
    inputValuesMap?: Record<string, string>;
    immutable?: boolean;
    titleKey?: ParseKeys;
    titleString?: string;
    initialSize?: "small" | "medium" | "large";
    valueEditor?: ValueEditorConfig;
  };
  docMediaPreview: {
    src: string;
    mediaType: "video" | "image";
    label?: string;
    aspectRatio?: string;
  };
  levelSelect: Record<string, never>;
  levelManager: Record<string, never>;
  levelEditorPropText: {
    entityId: string;
    propName: string;
    initialValue: string;
    index?: number;
    /** Location of the edited string inside an object-valued property. */
    path?: (string | number)[];
  };
  collabRoom: Record<string, never>;
  collabLeaveRoom: Record<string, never>;
  collabEditIdentity: Record<string, never>;
  collabSaveConflict: {
    /** The saved slot that matches the room's level by uuid. */
    mapId: string;
  };
  deleteUnknownLayer: {
    layerId: string;
    layerName: string;
  };
  spellSelect: Record<string, never>;
  mpRoom: Record<string, never>;
  characterCustomization: Record<string, never>;
  skillTreeDetail: {
    skillId: string;
    skillName: string;
    skillDescription: string;
    /** When set, the modal loads this MDX doc instead of the description, and
     * requires scrolling to the end before the skill can be learned. */
    docsLink?: DocId;
    /** Whether the skill is eligible to be learned: the core skill, or one
     * adjacent to an already-learned skill in the connection graph. */
    learnable: boolean;
    /** When set, learning the skill also grants this built-in spell preset. */
    unlocksPreset?: BuiltInScriptId;
  };
};

export type KnownModalNames = keyof KnownModalArgTypes;
export type ModalName = KnownModalNames | string;

export type ModalArgType<T extends ModalName = string> =
  T extends KnownModalNames
    ? KnownModalArgTypes[T]
    : Record<string, unknown> | undefined;

export type ModalConfigType<T extends ModalName = string> = {
  modalName: T;
  modalArg: ModalArgType<T>;
  disallowClose?: boolean;
};

export type ModalInstanceType<T extends ModalName = string> =
  ModalConfigType<T> & {
    id: string;
  };

export type ModalComponentPropsType<T extends ModalName = string> =
  ModalInstanceType<T> & {
    opening?: boolean;
    closing?: boolean;
    zIndex: number;
  };

export type ModalComponentType<T extends ModalName = string> = ComponentType<
  ModalComponentPropsType<T>
>;

export type ModalDefinitionType<T extends ModalName = string> = {
  modalName: T;
  component: ModalComponentType<T>;
};
