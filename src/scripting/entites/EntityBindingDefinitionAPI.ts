import { Clazz } from "../core/typings";
import { EntityInfo } from "./BaseEntityInfo";

export type EntityInfoExtensionClazz = Clazz<EntityInfo> & {
  type: string;
};
