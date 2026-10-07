import { EntityAlignment } from "src/api/entity";

const hitAlignmentMatrix = new Map<EntityAlignment, Set<EntityAlignment>>([
  [
    EntityAlignment.Enemy,
    new Set([
      EntityAlignment.Enemy,
      EntityAlignment.Environment,
      EntityAlignment.EnvironmentalHazard
    ])
  ],
  [
    EntityAlignment.Environment,
    new Set([
      EntityAlignment.Environment,
      EntityAlignment.EnvironmentalHazard,
      EntityAlignment.Player,
      EntityAlignment.Enemy,
      EntityAlignment.NPC
    ])
  ]
]);

export function hits(
  targetAlignment: EntityAlignment | undefined,
  otherEntityAlignment: EntityAlignment | undefined
) {
  if (targetAlignment === undefined) return true;
  if (targetAlignment === otherEntityAlignment) return true;
  if (
    otherEntityAlignment !== undefined &&
    hitAlignmentMatrix.get(targetAlignment)?.has(otherEntityAlignment)
  )
    return true;
  return otherEntityAlignment === undefined;
}
