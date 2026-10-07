# Spell Module Patterns

> Reference for how spell modules and scripted entities are wired in
> `src/scripting/`. Written for whoever (human or Claude) needs to author or
> debug a module. Grounded in the actual code — verify paths/symbols still exist
> before relying on them.

## The big picture

Spell code runs in a **web worker** (the "pseudo" / interpreter side, using a
JS-interpreter sandbox). Anything that touches the game — the `Level`, Three.js,
entities, physics — runs on the **main thread** (the "native" side). A module
bridges the two:

- **pseudo side**: what `require("name")` returns inside spell code.
- **native side**: the privileged handler that actually mutates the world.
- **RPC bridge**: pseudo calls native by name over `nativeRPC`; args are
  serialized across the worker boundary.

**There is one module system.** Every spell module lives under
`src/scripting/modules/auto/` as a `<Name>.native.ts` + `<Name>.pseudo.ts` pair
(a module with no native side has only the `.pseudo.ts`). The RPC plumbing and
autocomplete manifests between the two are **generated**, not hand-written. This
keeps native-only deps (Three.js, entities) out of the worker bundle.

`modules/shared/` holds helper utilities the native files import
(`resolveCaster`, `runtimeCastSequence`, `rpcContract`, `stackMagic`,
`runtimeAimHelper`, `util`, `spellVector`). It is **not** a module — just shared
code. (The legacy `manual/` `makeSimpleSpellModule` pattern and the
`SpellModules.ts` registry have been removed.)

---

## Authoring an `auto` module

### `<Name>.native.ts` — main-thread RPC handler

```ts
@assertAutoBindableNativeModule
export default class FooNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.events.on(SpellCtxEvents.runTerminated, this.teardown.bind(this));
  }

  // Every PUBLIC instance method becomes an RPC (name extracted at build time).
  async doThing(handleId: string, arg: SomeSerializable) { /* ... */ }

  teardown() { /* clean up tracked entities on run end */ }

  // private/protected methods are NOT exposed as RPCs — use them for helpers.
  private _helper() {}
}
```

Rules:
- **Default-export a class.** Its static name (`FooNative`) is the key shared by
  the generated binding files.
- **Public instance methods become RPCs.** Names are extracted as string
  literals by the generator. Keep helpers `private`/`protected`.
- **Constructor takes `SpellRuntimeModuleCtxAPI`** (gives `.level`, `.sync`,
  `.events`, `.consoleOutput`, `.casterId`, `.casterTrackingId`, `.store`,
  `.runtime`, …).
- **`teardown()` is optional.** If the class defines one, the generator wires it
  to run-end; if not, no teardown is emitted (don't reference `handler.teardown`).
- RPC args + return values must be **serializable** (cross-worker). Pass IDs and
  plain `{x,y}`, not entity references. (Returning an entity — e.g. a method that
  `return this`-es — will break the worker postMessage.)

### `<Name>.pseudo.ts` — worker-side definition

```ts
export default {
  name: "foo",            // the require("foo") key (and the manifest key)
  manifest: { /* ... */ },// autocomplete docs (see "Manifests" below) — OPTIONAL
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    // what require("foo") yields — see "What requirePseudo returns" below.
    return ctx.runner.translate.nativeToPseudo(FooInfo);
  }
} satisfies SpellRuntimeModulePseudo;
```

- `manifest` lives **here**, not on the native class — it documents the
  require()-able surface, a pseudo concern. (`SpellRuntimeModulePseudo` carries
  `manifest?: ModuleManifest`.)
- `ctx` is a `JSRunnerCtx<SpellPseudoRuntimeCtx>`: `ctx.runner` (translate,
  interpreter, …), `ctx.sync`, `ctx.nativeRPC`, `ctx.getModuleEvents(name)`.

### What `requirePseudo` returns — the module shapes

Pick by what `require("foo")` should yield. Reference module in parens.

| Shape | How | Examples |
|-------|-----|----------|
| **Entity class** | `nativeToPseudo(FooInfo)` where `FooInfo extends EntityInfo` (registered, synced). | spark, fire (Fireball), projectile, ice, earth, sensor |
| **Inline class with statics** | define the class *inside* `requirePseudo` (closes over `runner`), `nativeToPseudo(Foo)`. Needed when statics call RPCs — a module-level class's statics can't reach the per-runner runner. | fire (`Fire.blast/wave`), heal, grapple, spells, tabs, area-preview |
| **Object of functions** | `nativeToPseudo({ a(){…}, b(){…} })`, each calling `getAutoPseudoRPCBindings(runner).FooNative.…`. | air, playerControls, playerInventory, terrain |
| **Single function** | `interpreter.createAsyncFunction(fn)`. | speed, getEntities, ping |
| **Pure-pseudo (no native)** | only a `.pseudo.ts`; no `.native.ts`. No RPC handler. | vector, self, wait, info, shapes |

### Generated files — DO NOT EDIT

`scripts/ts/generate-auto-module-bindings.ts` scans `auto/*.native.ts` (+ the
`.pseudo.ts` sibling) and emits:

| File | Runs on | Contents |
|------|---------|----------|
| `modules/autoNativeBindings.ts` | main thread | `{ [ClassName]: (ctx) => ({ handleDataRPC, teardown? }) }` — instantiates each handler + wraps it with the auto RPC dispatcher. `teardown` emitted only if the class has one. |
| `modules/autoPseudoBindings.ts` | worker | `AutoPseudoBindings` type + `buildAutoPseudoBindings(runner)` — a proxy map; each method forwards over `nativeRPC`. Method names baked in as string literals; **types** come from `GetPromisedRPCTypeSignaturesForClazz<ClassName>`. |
| `modules/autoSpellApiManifests.ts` (+ `.js`) | both | `AUTO_SPELL_API_MANIFESTS` — each module's `manifest` literal inlined verbatim. Includes **pure-pseudo** modules (scanned from `*.pseudo.ts` with no native sibling). The `.js` is committed (compiled for the node-run generators). |

Regenerate with `npm run generate-auto-module-bindings` (runs `scripts:compile`
first). Runs automatically on `prestart` and `prebuild` — **not** on HMR
mid-session, `pretest`, or `precommit`. So a rename mid-session can land stale
generated files; restart the dev server or rerun the script. **Gotcha:** if the
*generated* files have a TS error, `scripts:compile` fails and the script
short-circuits — run `node scripts/ts/generate-auto-module-bindings.js` directly
to regenerate from fixed sources, then the next compile passes.

### Wiring (how generated bindings reach the runtime)

- Pseudo modules are auto-discovered by an `import.meta.glob` in
  `modules/autoPseudoModules.ts` (`pseudoModulesAuto`), merged into
  `runner.modules` in `runtime/SpellWorkerInternal.ts`. No manual registration.
- Native handlers are looked up by `autoNativeBindings[moduleName]` in
  `runtime/SpellRuntime.ts`.
- **Jest caveat:** `import.meta.glob` is Vite-only and breaks under Jest, so
  `autoPseudoModules.ts` is isolated (the *only* glob file in the spell import
  graph) and mocked via `moduleNameMapper` → `config/jest/autoPseudoModulesMock.js`
  (which stubs a couple of module names so headless-RPC tests resolve). Keep
  `getAutoPseudoRPCBindings` (glob-free) in `autoPseudo.ts`, separate from the
  glob, so entity definitions can import it without dragging the glob into
  Jest/main contexts.

---

## The RPC bridge & the ID contract

From the pseudo side, call native via the proxy:

```ts
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
const rpcs = getAutoPseudoRPCBindings(runner);
await rpcs.FooNative.doThing(handleId, { x, y });
```

RPC payload is `{ method, data }`; `getAutomaticRPCHandler` on the native side
dispatches `data` to `handler[method](...data)` and ships the return back.

**ID contract (important):** every ID passed *into* an RPC method is a tracked
entity **handle ID** (`TrackingIdentifier.persistentHandleId`), resolved on the
native side via `this.ctx.sync.get(handleId)`. It is **not** a raw entity ID.

- `sync.get(id)` accepts a handle ID or an entity ID (handle first, then falls
  back to entity-id lookup) — but it only resolves entities that are **tracked**.
  A freshly spawned, untracked entity's raw `.id` will NOT resolve.
- Real entity IDs (`.currentEntity.id`) only flow **outward** — to things like
  `ManaTransferBeam` ctor, `entity.follow(id)`, `level.getEntity(id)`.
- A spell obtains a tracked handle ID from a tracking-aware source — e.g.
  `sensor.entities[i].id` (the sensor tracks its contacts). `require("getEntities")`
  returns **raw** ids and does NOT track, so its ids won't resolve as handles.

`resolveTrackedCaster(ctx, idOrTrackingId)` (in `shared/resolveCaster.ts`) wraps
`sync.get` for the caster and falls back to `ctx.casterTrackingId`.

---

## Scripted entities (`entites/definitions/`)

> Note the dir is spelled `entites` (sic).

When a module's `require()` value is an entity, the pseudo class extends
`EntityInfo` (`entites/BaseEntityInfo.ts`):

```ts
@autoTranslateClass({ constructorAsync: true, constructorValidator: fooValidator })
export class FooInfo extends EntityInfo<FooExtra> {
  static type = "Foo";          // must match the native entity's `type`
  public type = FooInfo.type;

  constructor(opt?: FooArg) { super(); this.opts = opt; }

  async postConstruct(runner: JSRunnerAPI) {  // async init, awaited before the
    this.runner = runner;                      // pseudo instance is handed to user
    const sync = spellEntitySyncFromRunner(this.runner);
    sync.setTracked(this.trackingId, this);    // registers + assigns a handle id
    await getAutoPseudoRPCBindings(this.runner)
      .FooNative.createFoo({ useHandleId: this.trackingId.persistentHandleId, /*…*/ });
  }

  @exposeProp() get bar() { return this.extra?.bar ?? 0; }  // synced from native
  @exposeProp() async doBar() { await this.rpcs.doBar(this.id); }
}
```

Key facts:
- **`@exposeProp`** marks members visible to spell code. Options: `raw`
  (receive/return interpreter pseudo-values; for interpreter-level work like
  `cast`), `synch`, `validator` (yup), `exposeErrorMessages`.
- **`postConstruct(runner)`** is the async init hook. The interpreter's
  constructor wrapper (`core/Bindings.ts`) awaits it (with `constructorAsync`)
  before handing the instance to spell code, so by the time the user has the
  object, `this.id` (the handle id) is set and the native entity exists.
  Preference order in the wrapper: `postConstruct` → else legacy `readyPromise`.
- **`this.id`** = `trackingId.persistentHandleId` (the handle id) — pass it to
  RPCs. The `createX` RPC takes a `useHandleId` so native tracks the real entity
  under the same handle the pseudo already stubbed (`setTracked`).
- **`extra` / `position` / `type` / `isEnemy`** are synced ~every 100ms from the
  native entity's `extraSpellBindingData()` etc. Read-through getters
  (`get bar() => this.extra?.bar`) reflect live state.
- **Register the class** in `entites/EntityBindingDefinitionRegistry.ts` so that
  entities arriving via sync (matched by `type` string) get the right pseudo
  class with its methods — not a bare `EntityInfo`.
- A `constructorValidator` belongs on whichever class is actually `new`-ed: the
  entity stub itself when it's returned directly, or the **inline subclass** when
  `requirePseudo` returns an extended class (e.g. Fire returns an inline
  `Fire extends Fireball` carrying the statics + validator).

### Callbacks (native → pseudo)

Two directions exist; pick by whether the target is a tracked entity.

- **worker → main**: pseudo entity method → native entity method via
  `spellEntitySyncFromRunner(runner).doMethodOnTracked(trackingId, "m", args)`
  (e.g. Piston). `doMethodOnTracked` **awaits** the native method's return.
  Note args are plain serialized values — native entity methods needing typed
  args (`Vector2`) or level orchestration go through the module handler instead.
- **main → worker**: native → a pseudo *entity* method via
  `ctx.sync.doPseudoMethod(trackingId, "m", args)` — used for entity callbacks
  (Sensor contacts → `_handleContact`, Fireball impact → `_handleImpact`).
- For a callback on a **non-entity** pseudo object (no tracked entity to target),
  use the module-message channel instead: native `ctx.sendModuleRpc(name, msg)`,
  pseudo `moduleAPIFromRunner(runner).getModuleEvents(name).on("moduleMessage", …)`
  (e.g. Aim's `onClick`).

---

## The sync layer (`runtime/SpellEntitySync*.ts`)

- **Runtime (main) side** `SpellEntitySyncRuntimeAPI`: `track(entity, bind?,
  skipSync?, explicitHandleId?)`, `get(id)`, `untrack`, `sync(id?)` (force an
  immediate push), `setReInstantiator` (recreate spell-made entities on level
  change), `doNativeMethod`, `doPseudoMethod`.
- **Pseudo (worker) side** `SpellEntitySyncPseudoAPI`: `setTracked`,
  `getTrackedWithoutRPC`, `doMethodOnTracked`, `requestTracking`,
  `handleUpdates` (applies synced `position`/`extra`/destroyed, and
  instantiates the registered EntityInfo class by `type`).
- Access from a runner via `spellEntitySyncFromRunner(runner)` (IOC key
  `kSpellEntitySync`).

---

## Manifests / autocomplete

`ModuleManifest` (`core/apiManifest.ts`) = `{ description?, export: ApiEntry }`.
`ApiEntry` kinds: `class` (`constructorParams`, `constructorOpts`, `properties`,
`staticProperties`), `function`, `object`, `value`.

Pipeline:
1. Pseudo `manifest` literal → captured **as raw text** by ts-morph → inlined
   into `autoSpellApiManifests.ts` (`AUTO_SPELL_API_MANIFESTS`).
2. `core/spellApiManifests.ts` spreads `...AUTO_SPELL_API_MANIFESTS` into
   `SPELL_API_MANIFESTS`.
3. `core/autocomplete.ts` consumes `SPELL_API_MANIFESTS` for `require()`
   completion; `scripts/ts/generate-spell-api-manifest.ts` emits the human-doc
   `generated/spellTypes.d.ts` (`npm run generate-spell-apis`).

Gotchas:
- The manifest is inlined **verbatim as a self-contained literal.** It must NOT
  reference local consts/helpers (e.g. a `const fn = …` or `VEC_ARG` used inside
  the literal) — those aren't in the generated file and become `Cannot find name`
  errors. Inline everything.
- It is **string literals, not validated against the class.** Rename a
  constructor opt / property / type string and the docs silently go stale.
- Methods/statics are documented only by what you put in `export.properties` /
  `export.staticProperties`.

---

## Robustness to renaming (what's safe vs. fragile)

- **Safe (TS-typed, no regen):** method *parameter* names/types — RPC signatures
  come from `GetPromisedRPCTypeSignaturesForClazz<T>`, params aren't extracted,
  and the manifest doesn't document params.
- **Breaks loudly at `tsc` (regen + fix caller):** native method name, native
  class name, file name (rename the `.pseudo.ts` sibling too — they're paired by
  `X.native.ts`↔`X.pseudo.ts`), nickname.
- **Silent / runtime-only (fragile):** the `require()` `name` (spell code is
  strings — `require("old")` fails at runtime, nothing static catches it); and
  everything inside the `manifest` literal (raw text, unvalidated).

---

## Validators (`auto/validators/`)

yup-based, shared across modules. e.g. `basicValidators.ts`
(`iVector2Validator`, `numberValidator`), `sparkValidators.ts`, plus per-module
files (`fireValidators`, `earthValidators`, `spellsValidators`, …). Used via
`@exposeProp({ validator })` (per-method arg) and
`@autoTranslateClass({ constructorValidator })` (constructor arg). A validator
needed by both the native handler and the pseudo class lives here so both import
it without crossing the worker boundary.

`shared/stackMagic.ts` (interpreter-state helpers: `earlyResolveWithPromise`,
`createPromiseGeneratingInterpreterState`, `addAsyncCall`, …) takes a
`JSRunnerAPI` directly (not a ctx).

---

## Testing notes (browser / MCP)

- Run a spell: `controller.spellRuntime.run(codeString, casterId)`. `require()`
  only works *inside* the spell string, not in `browser_evaluate`.
- In dev mode, spell `console.log` is forwarded to the browser console as
  `[Spell:<ctxId>] …`, plus lifecycle events (created / execution started /
  finished / error / terminated / destroyed). These logs are the most reliable
  assertion surface.
- **Run end → `teardown()` kills tracked entities.** Keep a spark/entity alive
  for inspection with a trailing `wait(…)`, or assert via the spell's own logs.
- Spark cast sequences, mana streaming, and `zoomTo` movement need the game
  running in **real time** — frame-stepping does not advance the worker the same
  way.
- For `leech`/`passMana`-style methods, give the spell a **tracked** handle id
  (e.g. from `sensor.entities`), not a raw spawned-entity id.

---

## File map (quick reference)

```
src/scripting/
├── modules/
│   ├── auto/
│   │   ├── <Name>.native.ts        # main-thread RPC handler (default-export class)
│   │   ├── <Name>.pseudo.ts        # worker def { name, manifest?, requirePseudo }
│   │   │                           #   (a pure-pseudo module has only this file)
│   │   └── validators/             # shared yup validators
│   ├── shared/                     # helpers used by native files (NOT a module)
│   │   ├── resolveCaster.ts, runtimeCastSequence.ts, rpcContract.ts
│   │   ├── stackMagic.ts, runtimeAimHelper.ts, util.ts
│   │   └── spellVector.ts          # SpellVector class (require("vector") returns it)
│   ├── autoNativeBindings.ts       # GENERATED — native handler factories
│   ├── autoPseudoBindings.ts       # GENERATED — pseudo RPC proxies + types
│   ├── autoSpellApiManifests.ts    # GENERATED — AUTO_SPELL_API_MANIFESTS (+ .js)
│   ├── autoPseudo.ts               # getAutoPseudoRPCBindings (glob-free)
│   ├── autoPseudoModules.ts        # import.meta.glob of *.pseudo.ts (Jest-mocked)
│   └── autoAPI.ts                  # auto-module type contracts
├── entites/                        # (sic) scripted-entity pseudo classes
│   ├── BaseEntityInfo.ts           # EntityInfo base
│   ├── definitions/<Name>.ts       # extends EntityInfo
│   └── EntityBindingDefinitionRegistry.ts  # type → EntityInfo class
├── runtime/
│   ├── SpellRuntime.ts             # main-thread runtime; autoNativeBindings lookup
│   ├── SpellWorkerInternal.ts      # worker; merges pseudoModulesAuto
│   ├── SpellEntitySync.ts / *API.ts# tracking/sync bridge
│   └── SpellRuntimeAPI.ts          # SpellRuntimeModulePseudo, ctx types
├── core/
│   ├── Bindings.ts                 # @autoTranslateClass/@exposeProp, pseudo<->native
│   ├── apiManifest.ts              # ModuleManifest / ApiEntry types
│   ├── spellApiManifests.ts        # SPELL_API_MANIFESTS (spreads auto manifests)
│   └── autocomplete.ts             # require() completion
└── scripts (repo root scripts/ts/)
    ├── generate-auto-module-bindings.ts    # emits the 3 generated files
    └── generate-spell-api-manifest.ts      # emits generated/spellTypes.d.ts
```
```
prestart / prebuild → npm run generate-auto-module-bindings
                       (NOT on HMR, pretest, or precommit)
```
