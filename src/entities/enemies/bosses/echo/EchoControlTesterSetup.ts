import { BaseEntityType } from "src/api/entity";
import { ThreeSpine } from "src/engine/spine/ThreeSpine";

import { EchoBone } from "./dataTypes";
import { EchoAnimationCycler } from "./EchoAnimationCycler";
import { EchoControlTester } from "./EchoControlTester";

export interface ControlTesterSetupResult {
  children: BaseEntityType[];
  controlTesters: EchoControlTester[];
  smallCannonTesters: EchoControlTester[];
  bigCannonTesters: EchoControlTester[];
  /** Pre-world-transform hook that applies bone offsets from all testers. */
  preWorldTransformHook: () => void;
}

/**
 * Constructs all debug control testers (position/rotation handles, animation
 * cycler) for the Echo entity. Returns the child entities and the
 * preWorldTransform hook that applies tester offsets to bones.
 */
export function createControlTesters(
  parent: BaseEntityType,
  threeSpine: ThreeSpine
): ControlTesterSetupResult {
  const visualOffsetDist = 0.6;
  const children: BaseEntityType[] = [];
  const controlTesters: EchoControlTester[] = [];
  const smallCannonTesters: EchoControlTester[] = [];
  const bigCannonTesters: EchoControlTester[] = [];

  // Position testers (circles)
  const bodyPosTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.Body2,
    mode: "position",
    color: 0x33ff33
  });
  controlTesters.push(bodyPosTester);
  children.push(bodyPosTester);

  const headPosTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.Head,
    mode: "position",
    color: 0xff3333
  });
  controlTesters.push(headPosTester);
  children.push(headPosTester);

  // Rotation testers (diamonds, offset from bone)
  const bodyRotTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.Body2,
    mode: "rotation",
    color: 0x33ff99,
    visualOffset: { x: 0, y: visualOffsetDist }
  });
  controlTesters.push(bodyRotTester);
  children.push(bodyRotTester);

  const headRotTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.Head,
    mode: "rotation",
    color: 0xff9933,
    visualOffset: { x: 0, y: visualOffsetDist }
  });
  controlTesters.push(headRotTester);
  children.push(headRotTester);

  // Small cannon testers (hidden until the slot has an attachment)
  const cannonPosTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.SmallCannon,
    mode: "position",
    color: 0x3399ff
  });
  cannonPosTester.hidden = true;
  controlTesters.push(cannonPosTester);
  smallCannonTesters.push(cannonPosTester);
  children.push(cannonPosTester);

  const cannonRotTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.SmallCannon,
    mode: "rotation",
    color: 0x33ccff,
    visualOffset: { x: 0, y: visualOffsetDist }
  });
  cannonRotTester.hidden = true;
  controlTesters.push(cannonRotTester);
  smallCannonTesters.push(cannonRotTester);
  children.push(cannonRotTester);

  // Big cannon testers (hidden until the slot has an attachment)
  const bigCannonPosTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.InnerCannon1,
    mode: "position",
    color: 0xff3399
  });
  bigCannonPosTester.hidden = true;
  controlTesters.push(bigCannonPosTester);
  bigCannonTesters.push(bigCannonPosTester);
  children.push(bigCannonPosTester);

  const bigCannonRotTester = new EchoControlTester({
    position: parent.position.clone(),
    parent,
    threeSpine,
    boneName: EchoBone.InnerCannon1,
    mode: "rotation",
    color: 0xff66cc,
    visualOffset: { x: 0, y: visualOffsetDist }
  });
  bigCannonRotTester.hidden = true;
  controlTesters.push(bigCannonRotTester);
  bigCannonTesters.push(bigCannonRotTester);
  children.push(bigCannonRotTester);

  // Animation cycler (top-right of entity)
  const animCycler = new EchoAnimationCycler({
    position: parent.position.clone(),
    parent,
    threeSpine,
    offset: { x: 1.5, y: 2.0 },
    color: 0xffcc00
  });
  children.push(animCycler);

  // Build the preWorldTransform hook that applies bone offsets from testers.
  // Captures post-animation bone values each frame so we can apply
  // offsets without accumulation (bones not keyed by the animation
  // retain their value from the previous frame).
  const boneBaseValues = new Map<string, { x: number; y: number; rotation: number }>();

  const preWorldTransformHook = () => {
    // First pass: collect all offsets per bone (multiple testers may target the same bone)
    const posOffsets = new Map<string, { x: number; y: number }>();
    const rotOffsets = new Map<string, number>();

    for (const tester of controlTesters) {
      if (tester.mode === "position") {
        if (tester.boneOffsetX !== 0 || tester.boneOffsetY !== 0) {
          posOffsets.set(tester.boneName, { x: tester.boneOffsetX, y: tester.boneOffsetY });
        }
      } else {
        if (tester.boneRotationOffset !== 0) {
          rotOffsets.set(tester.boneName, tester.boneRotationOffset);
        }
      }
    }

    // Collect all unique bone names
    const allBones = new Set<string>();
    for (const tester of controlTesters) allBones.add(tester.boneName);

    for (const boneName of allBones) {
      const bone = threeSpine.skeleton.findBone(boneName);
      if (!bone) continue;

      const hasPos = posOffsets.has(boneName);
      const hasRot = rotOffsets.has(boneName);

      if (!hasPos && !hasRot) {
        // No offsets active — capture current animated values as base
        boneBaseValues.set(boneName, { x: bone.x, y: bone.y, rotation: bone.rotation });
        continue;
      }

      const base = boneBaseValues.get(boneName) ?? {
        x: bone.data.x, y: bone.data.y, rotation: bone.data.rotation
      };

      if (hasPos) {
        const pos = posOffsets.get(boneName)!;
        bone.x = base.x + pos.x;
        bone.y = base.y + pos.y;
      }
      if (hasRot) {
        bone.rotation = base.rotation + rotOffsets.get(boneName)!;
      }
    }
  };

  return {
    children,
    controlTesters,
    smallCannonTesters,
    bigCannonTesters,
    preWorldTransformHook
  };
}
