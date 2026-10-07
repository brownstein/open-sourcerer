// Jest mock for src/scripting/modules/autoPseudoModules.ts.
//
// The real file uses Vite's `import.meta.glob`, a build-time construct that
// Jest's babel transform can't evaluate. We stub the registry with a couple of
// minimal pseudo-module entries so worker-level tests (e.g. headless module
// RPC) can resolve auto modules by name. At runtime (Vite) the real file is
// used and the glob resolves every *.pseudo.ts normally.
module.exports = {
  pseudoModulesAuto: {
    wait: { name: "wait", requirePseudo: () => undefined }
  }
};
