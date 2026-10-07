# Echo Skeleton Guide

Reference for the Echo boss Spine2D skeleton: bones, slots, constraints, and how they map to visual parts.

## Bone Hierarchy Overview

```
root
├── Images/body2  (central body hub)
│   ├── Images/Neck → Images/Head  (head assembly)
│   ├── leg1_fr, leg2_fr, leg3_fr  (front legs)
│   ├── Leg1_bc, Leg2_bc, Leg3_bc  (back legs)
│   ├── Images/body3 → Images/body4 → Images/body5  (body segment chain)
│   ├── Inner_Cannon1, Inner_Cannon2, Inner_Cannon3  (big cannons)
│   └── (wires attach to body segments)
├── target_leg_fr_1, target_leg_fr_2, target_leg_fr_3  (front leg IK targets)
├── targ_leg_bc_1, targ_leg_bc_2, targ_leg_bc_3  (back leg IK targets)
```

---

## Head

The head sits at the end of a neck chain off the main body. It contains the eye tracking system and two articulated arms (antennae/claws).

### Bones

| Bone | Parent | Description |
|------|--------|-------------|
| `Images/Neck` | `Images/body2` | Neck connecting body to head |
| `Images/Head` | `Images/Neck` | Head base |
| `Images/Eyes_sockets` | `Images/Head` | Eye socket mount |
| `Images/Eyes_sockets2` | `Images/Eyes_sockets` | Inner eye socket (IK driven) |
| `Images/Eyes_sockets3` | `Images/Eyes_sockets2` | Innermost socket — holds the big eye |
| `Big_eye` | `Images/Eyes_sockets` | IK target for eye tracking |
| `Images/Wires_head` | `Images/Eyes_sockets` | Head wire decoration |
| `Images/Wires_head2` | `Images/Wires_head` | Secondary head wire |

### Arm / Antenna (Front)

| Bone | Parent | Description |
|------|--------|-------------|
| `Arm_fr` | `Images/Head` | Front arm root (3 segments) |
| `Images/Arm8_3` | `Arm_fr` | Front arm mid |
| `Images/Arm8_5` | `Images/Arm8_3` | Front arm tip |

### Arm / Antenna (Back)

| Bone | Parent | Description |
|------|--------|-------------|
| `Arm_bc` | `Images/Head` | Back arm root (3 segments) |
| `Images/Arm8_4` | `Arm_bc` | Back arm mid |
| `Images/Arm8_6` | `Images/Arm8_4` | Back arm tip |

### Slots

| Slot | Bone | Default Attachment |
|------|------|--------------------|
| `Images-Neck` | `Images/Neck` | `Images/Neck` (region) |
| `Images-base_head_bottom` | `Images/Head` | `Images/base_head_bottom` (region) |
| `Images-base_head` | `Images/Head` | `Images/base_head` (region) |
| `Images-Gear` | `Images/Head` | `Images/Gear` (region) |
| `Images-Eyes_sockets_bottom` | `Images/Eyes_sockets` | `Images/Eyes_sockets_bottom` (region) |
| `Images-Eyes_sockets` | `Images/Eyes_sockets` | `Images/Eyes_sockets` (region) |
| `Images-Eye_big` | `Images/Eyes_sockets3` | `Images/Eye_big` (region) |
| `Images-Wires_head` | `Images/Wires_head` | `Images/Wires_head` (mesh) |
| `Images-Arm8_1` | `Arm_fr` | `Images/Arm8_1` (region) — front arm root segment |
| `Images-Arm8_2` | `Images/Arm8_3` | `Images/Arm8_2` (region) — front arm mid |
| `Images-Arm8_3` | `Images/Arm8_5` | `Images/Arm8_3` (region) — front arm tip |
| `Images-Arm8_4` | `Arm_bc` | `Images/Arm8_1` (region) — back arm root segment |
| `Images-Arm8_5` | `Images/Arm8_4` | `Images/Arm8_2` (region) — back arm mid |
| `Images-Arm8_6` | `Images/Arm8_6` | `Images/Arm8_3` (region) — back arm tip |

### IK Constraint

| Constraint | Driven Bone | Target | Purpose |
|------------|-------------|--------|---------|
| `Big_eye` | `Images/Eyes_sockets2` | `Big_eye` | Eye tracks the IK target |

---

## Main Body

The body is a chain of three segments (`body3` → `body4` → `body5`) hanging off the central hub (`body2`). Each segment has upper and lower halves with cannon shell artwork, plus modem decorations on top and bottom.

### Bones

| Bone | Parent | Description |
|------|--------|-------------|
| `Images/body2` | `root` | Central body hub — all legs and the body chain attach here |
| `Images/body3` | `Images/body2` | Body segment 1 (front) |
| `Images/body4` | `Images/body3` | Body segment 2 (middle) |
| `Images/body5` | `Images/body4` | Body segment 3 (rear) |

### Segment Shell Bones

Each segment has upper and lower shell halves that open/close:

| Bone | Parent | Description |
|------|--------|-------------|
| `Body_up_1` | `Images/body3` | Segment 1 upper shell |
| `Body_down_1` | `Images/body3` | Segment 1 lower shell |
| `Body_up_2` | `Images/body4` | Segment 2 upper shell |
| `Body_down_2` | `Images/body4` | Segment 2 lower shell |
| `Body_up_3` | `Images/body5` | Segment 3 upper shell |
| `Body_down_3` | `Images/body5` | Segment 3 lower shell |

### Modem Decorations

Small antenna-like protrusions on the body shells:

| Bone | Parent | Description |
|------|--------|-------------|
| `Images/modem1_midle` | `Body_up_1` | Segment 1 top modem (middle) |
| `Images/modem1_up` | `Body_up_1` | Segment 1 top modem (upper) |
| `Images/modem1_bottom` | `Body_down_1` | Segment 1 bottom modem |
| `Images/modem2_up` | `Body_up_2` | Segment 2 top modem |
| `Images/modem2_bottom` | `Body_down_2` | Segment 2 bottom modem |
| `Images/modem3_midle` | `Body_up_3` | Segment 3 top modem (middle) |
| `Images/modem3_up` | `Body_up_3` | Segment 3 top modem (upper) |
| `Images/modem3_bottom` | `Body_down_3` | Segment 3 bottom modem |

### Slots

| Slot | Bone | Default Attachment | Notes |
|------|------|--------------------|-------|
| `Images-body1` | `Images/body2` | (none visible) | Central body — swaps during Transform |
| `Images-Upper_body_1` | `Body_up_1` | `Images/Upper_body_cannon_1` (region) | Seg 1 upper shell |
| `Images-Upper_body_1_back` | `Body_up_1` | `Images/Upper_body_cannon_1_back` (region) | Seg 1 upper shell (back layer) |
| `Images-Bottom_body_1front` | `Body_down_1` | `Images/Bottom_body_cannon_1` (region) | Seg 1 lower shell |
| `Images-Bottom_body_1back` | `Body_down_1` | `Images/Bottom_body_cannon_11` (region) | Seg 1 lower shell (back layer) |
| `Images-Upper_body_2` | `Body_up_2` | `Images/Upper_body_cannon_2` (region) | Seg 2 upper shell |
| `Images-Upper_body_2_back` | `Body_up_2` | `Images/Upper_body_cannon_2_back` (region) | Seg 2 upper shell (back layer) |
| `Images-Bottom_body_2` | `Body_down_2` | `Images/Bottom_body_Cannon_2front` (region) | Seg 2 lower shell |
| `Images-Bottom_body_2_back` | `Body_down_2` | `Images/Bottom_body_Cannon_2back` (region) | Seg 2 lower shell (back layer) |
| `Images-Upper_body_3` | `Body_up_3` | `Images/Upper_body_cannon_3` (region) | Seg 3 upper shell |
| `Images-Upper_body_3_back` | `Body_up_3` | `Images/Upper_body_cannon_3_back` (region) | Seg 3 upper shell (back layer) |
| `Images-Bottom_body_3` | `Body_down_3` | `Images/Bottom_body_cannon_3front` (region) | Seg 3 lower shell |
| `Images-Bottom_body_3_back` | `Body_down_3` | `Images/Bottom_body_cannon_3back` (region) | Seg 3 lower shell (back layer) |
| `Images-modem1_bottom` | `Images/modem1_bottom` | `Images/modem1_bottom` (region) | |
| `Images-modem1_midle` | `Images/modem1_midle` | `Images/modem1_midle` (region) | |
| `Images-modem1_up` | `Images/modem1_up` | `Images/modem1_up` (region) | |
| `Images-modem2_bottom` | `Images/modem2_bottom` | `Images/modem2_bottom` (region) | |
| `Images-modem2_up` | `Images/modem2_up` | `Images/modem2_up` (region) | |
| `Images-modem3_bottom` | `Images/modem3_bottom` | `Images/modem3_bottom` (region) | |
| `Images-modem3_midle` | `Images/modem3_midle` | `Images/modem3_midle` (region) | |
| `Images-modem3_up` | `Images/modem3_up` | `Images/modem3_up` (region) | |

### Cannons

Cannons are mounted on the central body hub. There are three inner cannon bones plus a small cannon on the rear segment. Cannon slots swap between frame sequences during shoot animations.

| Bone | Parent | Description |
|------|--------|-------------|
| `Inner_Cannon1` | `Images/body2` | Big cannon mount (front-most) |
| `Inner_Cannon2` | `Images/body2` | Big cannon mount (middle) |
| `Inner_Cannon3` | `Images/body2` | Big cannon mount (rear) |
| `Small_cannon` | `Images/body5` | Small cannon on rear body segment |

| Slot | Bone | Default Attachment |
|------|------|--------------------|
| `Images-Inner_canon1` | `Inner_Cannon1` | `Images/Cannons/Big cannon/Cannon_out_big_000` (region) |
| `Images-Inner_canon2` | `Inner_Cannon2` | `Images/Inner_canon` (region) |
| `Images-Inner_canon` | `Inner_Cannon3` | `Images/Inner_canon` (region) |
| `Small_cannon` | `Small_cannon` | (none in idle) |

**Animated attachment sequences:**
- Big cannon deploy: `Cannon_out_big_000` through `_009` (10 frames)
- Big cannon shoot: `Cannon_shoot_big_000` through `_008` (9 frames)
- Small cannon deploy: `Cannon_small_000` through `_028` (29 frames)
- Small cannon shoot: `Cannon_small_shoot_000` through `_002` (3 frames)

---

## Legs

Six legs total — three front (`_fr`) and three back (`_bc`). Each leg is a 2-bone IK chain: an upper bone parented to `body2` and a lower bone at the tip, driven by an IK target bone parented to `root`.

### Front Legs

Each front leg: upper segment → lower segment, IK-constrained to a ground target.

#### Leg 1 (Front)
| Bone | Parent | Role |
|------|--------|------|
| `leg1_fr` | `Images/body2` | Upper leg |
| `Images/Leg_4` | `leg1_fr` | Lower leg |
| `target_leg_fr_1` | `root` | IK target (ground contact) |
| `Images/Leg_6` | `target_leg_fr_1` | Foot tip |

#### Leg 2 (Front)
| Bone | Parent | Role |
|------|--------|------|
| `leg2_fr` | `Images/body2` | Upper leg |
| `Images/Leg_8` | `leg2_fr` | Lower leg |
| `target_leg_fr_2` | `root` | IK target |
| `Images/Leg_9` | `target_leg_fr_2` | Foot tip |

#### Leg 3 (Front)
| Bone | Parent | Role |
|------|--------|------|
| `leg3_fr` | `Images/body2` | Upper leg |
| `Images/Leg_5` | `leg3_fr` | Lower leg |
| `target_leg_fr_3` | `root` | IK target |
| `Images/Leg_10` | `target_leg_fr_3` | Foot tip |

### Back Legs

Same structure as front legs, mirrored.

#### Leg 1 (Back)
| Bone | Parent | Role |
|------|--------|------|
| `Leg1_bc` | `Images/body2` | Upper leg |
| `Images/Leg_23` | `Leg1_bc` | Lower leg |
| `targ_leg_bc_1` | `root` | IK target |
| `Images/Leg_24` | `targ_leg_bc_1` | Foot tip |

#### Leg 2 (Back)
| Bone | Parent | Role |
|------|--------|------|
| `Leg2_bc` | `Images/body2` | Upper leg |
| `Images/Leg_15` | `Leg2_bc` | Lower leg |
| `targ_leg_bc_2` | `root` | IK target |
| `Images/Leg_16` | `targ_leg_bc_2` | Foot tip |

#### Leg 3 (Back)
| Bone | Parent | Role |
|------|--------|------|
| `Leg3_bc` | `Images/body2` | Upper leg |
| `Images/Leg_21` | `Leg3_bc` | Lower leg |
| `targ_leg_bc_3` | `root` | IK target |
| `Images/Leg_22` | `targ_leg_bc_3` | Foot tip |

### Leg IK Constraints

| Constraint | Driven Chain | Target |
|------------|-------------|--------|
| `target_leg_fr_1` | `leg1_fr` → `Images/Leg_4` | `target_leg_fr_1` |
| `target_leg_fr_2` | `leg2_fr` → `Images/Leg_8` | `target_leg_fr_2` |
| `target_leg_fr_3` | `leg3_fr` → `Images/Leg_5` | `target_leg_fr_3` |
| `targ_leg_bc_1` | `Leg1_bc` → `Images/Leg_23` | `targ_leg_bc_1` |
| `targ_leg_bc_2` | `Leg2_bc` → `Images/Leg_15` | `targ_leg_bc_2` |
| `targ_leg_bc_3` | `Leg3_bc` → `Images/Leg_21` | `targ_leg_bc_3` |

### Leg Slots

Front legs use `Images/Leg_1`, `_2`, `_3` region images (upper, mid, foot). Back legs use `Images/Leg1_1`, `_2`, `_3`.

| Slot | Bone | Default Attachment | Position |
|------|------|--------------------|----------|
| `Images-Leg_4` | `leg1_fr` | `Images/Leg_1` | Front leg 1 upper |
| `Images-Leg_5` | `Images/Leg_4` | `Images/Leg_2` | Front leg 1 lower |
| `Images-Leg_6` | `Images/Leg_6` | `Images/Leg_3` | Front leg 1 foot |
| `leg2_fr` | `leg2_fr` | `Images/Leg_1` | Front leg 2 upper |
| `Images-Leg_8` | `Images/Leg_8` | `Images/Leg_2` | Front leg 2 lower |
| `Images-Leg_9` | `Images/Leg_9` | `Images/Leg_3` | Front leg 2 foot |
| `Images-Leg_10` | `leg3_fr` | `Images/Leg_1` | Front leg 3 upper |
| `Images-Leg_11` | `Images/Leg_5` | `Images/Leg_2` | Front leg 3 lower |
| `Images-Leg_12` | `Images/Leg_10` | `Images/Leg_3` | Front leg 3 foot |
| `Images-Leg_13` | `Leg1_bc` | `Images/Leg1_1` | Back leg 1 upper |
| `Images-Leg_25` | `Images/Leg_23` | `Images/Leg1_2` | Back leg 1 lower |
| `Images-Leg_26` | `Images/Leg_24` | `Images/Leg1_3` | Back leg 1 foot |
| `Images-Leg_16` | `Leg2_bc` | `Images/Leg1_1` | Back leg 2 upper |
| `Images-Leg_17` | `Images/Leg_15` | `Images/Leg1_2` | Back leg 2 lower |
| `Images-Leg_18` | `Images/Leg_16` | `Images/Leg1_3` | Back leg 2 foot |
| `Images-Leg_22` | `Leg3_bc` | `Images/Leg1_1` | Back leg 3 upper |
| `Images-Leg_23` | `Images/Leg_21` | `Images/Leg1_2` | Back leg 3 lower |
| `Images-Leg_24` | `Images/Leg_22` | `Images/Leg1_3` | Back leg 3 foot |

---

## Wires

Eight wire systems hang from various body segments. Each wire has:
- A **root bone** attached to a body segment
- An **IK chain** (2 bones) for the main draping shape
- A **path constraint chain** of small bones that follow a path attachment for fine detail
- A **controller bone** used as a path constraint position handle
- A **mesh or region slot** for the visible wire image
- A **path slot** containing the path attachment that the chain follows

### Wire Summary

| Wire | Root Bone Parent | IK Constraint | Path Constraint | Image Slot | Path Slot |
|------|-----------------|---------------|-----------------|------------|-----------|
| Wire 1 | `Images/body4` | `targ_wire_1` | `Wire1` (8 bones) | `Images-Wire_large4` (mesh) | `Wire1` (path) |
| Wire 2 | `Body_up_1` | `Ik2` | `Path_wire1` (10 bones) | `Images-Wire_vary_large3` (mesh) | `Path_wire1` (path) |
| Wire 3 | `Images/body3` | `IK_wire4` | `wire3` (8 bones) | `Images-Wire_normal1` (mesh) | `wire3` (path) |
| Wire 5 | `Images/body4` | `IK_wire5` | `wire5` (8 bones) | `Images-Wire_vary_large2` (mesh) | `wire5` (path) |
| Wire 6 | `Body_down_2` | `IK_wire6` | `Wire6` (10 bones) | `Images-Wire_vary_large4` (mesh) | `Wire6` (path) |
| Wire 7 | `Images/body4` | `wire7` | `Wire_7` (8 bones) | `Images-Wire_large3` (mesh) | `Wire_7` (path) |
| Wire 8 | `Images/body5` | `wire8` | `wire8` (10 bones) | `Images-Wire_vary_large5` (mesh) | `wire8` (path) |
| Wire 9 | `Images/body3` | `Taget_wire9` | `Wire_n9` (10 bones) | `Images-Wire_very_very_large1` (mesh) | `Wire_n9` (path) |

### Static Wire Slots

Two additional wire image slots that are not path-constrained:

| Slot | Bone | Default Attachment |
|------|------|--------------------|
| `Images-Wire_small1` | `Images/body5` | (none in idle) |
| `Images-Wire_large1` | `Images/body3` | (none in idle) |
| `Images-Wire_vary_large1` | `Images/Wire_normal8` | (none in idle) |

### Wire Detail: Bone Chains

Each wire's path constraint chain consists of small bones that conform to the path shape. Listed as root → tip:

| Wire | IK Bones | Path Chain Bones | Controller |
|------|----------|-----------------|------------|
| Wire 1 | `Ik_wire1_bon1` → `bone3` | `Wire4` → `Wire19..Wire25` | `Wire1_controler` |
| Wire 2 | `bone30` → `bone31` | `bone33..bone42` | `Wire_controler` |
| Wire 3 | `bone13` → `bone14` | `bone16..bone23` | `Wire3_controler` |
| Wire 5 | `ik_wire5` → `bone26` | `bone28..bone48` | `Wire5_controller` |
| Wire 6 | `Wire7` → `Wire8` | `Wire9..Wire18` | `Wire6_controller` |
| Wire 7 | `bone24` → `bone49` | `Wire_8..Wire_15` | `Wire7_controller` |
| Wire 8 | `bone50` → `bone51` | `bone52..bone61` | `Wire8_controller` |
| Wire 9 | `Wire_n10` → `Wire_n11` | `Wire_n12..Wire_n21` | `Wire9_controller` |

---

## Animations

| Animation | Duration | Description |
|-----------|----------|-------------|
| `Idle` | 3.0s | Resting pose, subtle body sway |
| `Idle2` | 3.0s | Alternate idle |
| `Wulk new` | 1.0s | Forward walk cycle |
| `Walk_attack_mode` | 1.0s | Aggressive forward walk |
| `Walk agresevely` | 0.67s | Fast aggressive walk |
| `Walk_backwards` | 1.0s | Reverse walk |
| `Lunge` | 2.0s | Forward lunge attack |
| `Big_cannon_shoot_down` | 1.83s | Big cannon fires downward |
| `Big_cannon_shoot_front` | 1.83s | Big cannon fires forward |
| `Big_cannon_shoot_up` | 1.83s | Big cannon fires upward |
| `Short_cannon_shoot` | 0.2s | Quick small cannon shot |
| `Transform` | 8.03s | Full transformation sequence |
| `animation` | 2.0s | Base/test animation |
