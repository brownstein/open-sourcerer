# Player Wolf Sprite Pipeline

How the player's wolf sprites are built, how their animations connect to the
game code, and how to fix the kinds of integration problems we hit when the
art was swapped in. **Read the "Critical gotcha" section before editing any
`.prs`.**

## Files in this folder

| File | What it is |
|------|-----------|
| `wolf-male.prs`, `wolf-female.prs` | **ProtoSprite** binary sprite data (frames, layers, animation tags, embedded PNG). This is what the game loads at runtime. |
| `wolf-male.prsg`, `wolf-female.prsg` | ProtoSprite **geometry** (per-frame collision/trace polygons), keyed by frame index. |
| `wolf-male.ts`, `wolf-female.ts` | **Generated** TypeScript: `sprite_layers` + `sprite_animations` string-literal unions for each sprite. Do not hand-edit — regenerate (see below). |
| `wolf-types.ts` | Hand-written. Unions the two generated files: `sprite_animations = maleTypes.sprite_animations \| femaleTypes.sprite_animations`. This is the type the player code consumes. |
| `work/*.aseprite` | **Source art** (Aseprite). The `.prs`/`.prsg`/`.ts` are derived from these. |
| `old/` | Previous-generation assets, kept for reference. |

Registration as runtime assets: `src/assets/allSpriteAssets.ts`
(`wolfMaleSprite`/`wolfFemaleSprite`) and `src/assets/allGeometryAssets.ts`.

## How animations connect to the code

The player code refers to animations **by tag name** (a string). All of these
must exist as an animation tag in *both* `.prs` files, spelled identically:

- **`tagName: "..."`** in `src/entities/player/Player.ts` — every
  `APIAnimationData` (idle, run, spell, swing_1, sheath, …). This is the set
  that is actually *played*; a missing/misspelled tag means the animation
  silently does not resolve.
- **`playerAnimationPriority`** keys in `src/entities/player/PlayerInternals.ts`
  — looked up by the *played* tag name. A stale key (e.g. `swing1` after the
  asset became `swing_1`) means that animation falls back to default priority.
- **`PlayerFullAnimations`** set in `PlayerInternals.ts` — full-body animation
  names used for logic.
- **Cast frame markers** in `PlayerInternals.ts`
  (`kPlayerCastHoldStart`/`HoldEnd`/`CastFrame`/`CastEndFrame`) — **frame
  offsets relative to the start of the `spell` animation**. They assume the
  canonical `spell` is 19 frames (frames 6/9/11/18 → hold loop / cast / end).
  If the `spell` tag's length changes, these must be retuned.
- **Type:** `PlayerAnimation = sprite_animations` (from `wolf-types.ts`). Because
  it is the *union* of both sprites' generated types, a name only needs to exist
  in one sprite to type-check — so **TypeScript will NOT catch a name that is
  missing from just one sprite.** Runtime resolution is per-sprite, so you must
  cross-check both `.prs` by hand (procedure below).

## Critical gotcha: duplicate animation names are last-wins

ProtoSprite builds its animation lookup as a `Map` keyed by tag name, populated
in file order (`protosprite-core` `util.js`: `animationMap.set(name, anim)`).
**If two tags share a name, the later one silently shadows the earlier one.**

This is exactly how the "casting is much faster" bug happened: the new art had
*two* tags named `spell` (the real 19-frame/1740ms one, and a stray
10-frame/1020ms one later in the file). `getAnimation("spell")` returned the
short one. Always check for duplicate names among the tags the code uses.

## Inspecting a `.prs`

```bash
# Full structure (animations + layers + frame counts)
node node_modules/protosprite-cli/dist/cli.js analyze -i src/entities/player/sprites/wolf-male.prs

# Per-frame durations, one animation
node node_modules/protosprite-cli/dist/cli.js analyze \
  -i src/entities/player/sprites/wolf-male.prs --frame-durations --animation spell
```

Animation lines look like `- spell (frames 293-311, 1740ms)`; layer lines have
`(opacity: ...)`. Filter animations with `grep "(frames "`.

## Cross-check: do the assets match the code?

Run from the project root. Confirms every code-referenced animation name resolves
in **both** `.prs`, and flags duplicates.

```bash
# 1) Collect names the code references (tagNames + priority keys + full-anim set)
{ grep -noE 'tagName:\s*"[^"]+"' src/entities/player/Player.ts | sed -E 's/.*"([^"]+)"/\1/';
  sed -n '/playerAnimationPriority/,/};/p' src/entities/player/PlayerInternals.ts | grep -oE "^[[:space:]]+[a-zA-Z_0-9]+:" | tr -d ' :';
  sed -n '/PlayerFullAnimations = new Set/,/]);/p' src/entities/player/PlayerInternals.ts | grep -oE '"[^"]+"' | tr -d '"'; } | sort -u > /tmp/codenames.txt

# 2) For each sprite, list its animation names and diff
for f in wolf-male wolf-female; do
  node node_modules/protosprite-cli/dist/cli.js analyze -i "src/entities/player/sprites/$f.prs" 2>&1 \
    | grep "(frames " | awk -F'- ' '{print $2}' | awk '{print $1}' | sort -u > /tmp/$f.txt
  echo "--- $f: code names NOT in asset (should be empty) ---"
  comm -23 /tmp/codenames.txt /tmp/$f.txt
  echo "--- $f: DUPLICATE tag names (watch for required ones) ---"
  node node_modules/protosprite-cli/dist/cli.js analyze -i "src/entities/player/sprites/$f.prs" 2>&1 \
    | grep "(frames " | awk -F'- ' '{print $2}' | awk '{print $1}' | sort | uniq -d
done
```

A non-empty "code names NOT in asset" list means a tag is missing/misspelled in
that sprite — fix the tag name (rename below). Duplicates of a *required* name
(e.g. `spell`) must be de-duplicated.

## Editing tags on a `.prs` (rename / de-dupe)

> `protosprite-cli edit` has **no rename** option (only `--remove-animation`,
> `--remove-layer`, `--set-duration`, `--set-animation-duration`,
> `--set-frame-duration`). `--remove-animation` removes by name, so it would
> delete *all* tags of that name — not useful when you need to keep one of a
> duplicate pair. For renames and targeted de-dupes, script against
> `protosprite-core` (the library the CLI wraps).

These edits are **non-destructive**: they only touch tag metadata (`name`,
range), never frames/pixels — frame count stays the same. Always re-run
`analyze` afterward and confirm `Frames: N` is unchanged.

Create the script **inside the repo** (so Node resolves `node_modules`), run it,
then delete it. It is `.mjs` because `protosprite-core` is ESM.

### Rename one or more tags

```js
// tmp-edit.mjs  (run: node ./tmp-edit.mjs   then: rm ./tmp-edit.mjs)
import { ProtoSpriteSheet } from "protosprite-core";
import fs from "fs";

const file = "src/entities/player/sprites/wolf-male.prs";
const RENAMES = { "swing1": "swing_1", "sheathe": "sheath", "un_sheathe": "unsheath" };

const sheet = ProtoSpriteSheet.fromArray(new Uint8Array(fs.readFileSync(file)));
const done = [];
for (const sprite of sheet.data.sprites) {
  for (const to of Object.values(RENAMES))
    if (sprite.animations.some((a) => a.name === to)) { console.error(`ABORT: "${to}" already exists`); process.exit(1); }
  for (const a of sprite.animations)
    if (RENAMES[a.name]) { done.push(`${a.name} -> ${RENAMES[a.name]}`); a.name = RENAMES[a.name]; }
}
if (!done.length) { console.error("nothing renamed"); process.exit(1); }
fs.writeFileSync(file, Buffer.from(sheet.toArray()));
console.log(done.join("\n"));
```

### Remove a duplicate tag block (keep the canonical one)

Used to kill the stray second `spell`. Keeps the longest tag of a duplicated
name and removes the other(s) plus any cast sub-tags inside their frame range:

```js
import { ProtoSpriteSheet } from "protosprite-core";
import fs from "fs";
const file = "src/entities/player/sprites/wolf-male.prs";
const NAME = "spell";
const CAST_TAGS = new Set(["spell","spell_anticipation","spell_loop","spell_smear","spell_attack"]);

const sheet = ProtoSpriteSheet.fromArray(new Uint8Array(fs.readFileSync(file)));
for (const sprite of sheet.data.sprites) {
  const dupes = sprite.animations.filter((a) => a.name === NAME);
  if (dupes.length <= 1) continue;
  const keep = dupes.reduce((b, a) => (a.indexEnd - a.indexStart > b.indexEnd - b.indexStart ? a : b)); // longest
  const drop = dupes.filter((a) => a !== keep);
  sprite.animations = sprite.animations.filter((a) =>
    !(CAST_TAGS.has(a.name) && drop.some((d) => a.indexStart >= d.indexStart && a.indexEnd <= d.indexEnd)));
}
fs.writeFileSync(file, Buffer.from(sheet.toArray()));
```

## Regenerating the type files

After any tag rename/removal, regenerate the per-sprite `.ts` so the type union
matches reality (this also makes future drift a compile error). Reads the
**edited `.prs`**, writes only the types — does not touch the `.prs`:

```bash
node node_modules/protosprite-cli/dist/cli.js build -i src/entities/player/sprites/wolf-male.prs   --write-types src/entities/player/sprites/wolf-male.ts
node node_modules/protosprite-cli/dist/cli.js build -i src/entities/player/sprites/wolf-female.prs --write-types src/entities/player/sprites/wolf-female.ts
npx tsc --noEmit   # must stay clean
```

## IMPORTANT: source of truth

These `.prs`-level edits do **not** change the `work/*.aseprite` sources. If the
art is re-exported from Aseprite, every issue below comes back. The durable fix
is to correct the **Aseprite tag names** and re-export. Treat `.prs` edits as a
stopgap to unblock integration, and mirror the fixes into the source art when
you can.

## What we fixed last time (2026-06, new wolf art swap)

Symptoms: casting played too fast; some sword animations didn't resolve. Causes
were all **tag-name mismatches between the new art and the code**, plus a
duplicate tag. Per file:

- **wolf-male.prs**: `swing1`→`swing_1`, `sheathe`→`sheath`,
  `un_sheathe`→`unsheath`, `Idle_sword_front`→`idle_sword_front`; removed a
  duplicate `spell` block (a stray 10-frame `spell` was shadowing the real
  19-frame one — the "casting too fast" bug).
- **wolf-female.prs**: removed the same duplicate `spell` block; fixed typo tag
  `spell_sumoon`→`spell_summon` (×6).
- **Code** (`PlayerInternals.ts`): `playerAnimationPriority` key `swing1`→
  `swing_1` (counterpart to the asset rename). `Player.ts` had already moved its
  `tagName`s to `swing_1`.
- Regenerated `wolf-male.ts` / `wolf-female.ts`.

wolf-female's art was otherwise authored with the correct names; wolf-male was
the inconsistent one. When updating, **always cross-check both sprites** — the
unioned type will not warn you about a name missing from just one.
