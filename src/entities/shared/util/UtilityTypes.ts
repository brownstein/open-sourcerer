import { BaseEntityType } from "src/api/entity";

import { AIBehavior } from "../behaviors/AIBehavior";

export type GetDirectives<T> =
  T extends BaseEntityType<{ ai: AIBehavior<infer D> }> ? D : never;
